import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { buildPack } from "../cli/src/pack/build.ts";
import { InMemoryPackSource } from "../lib/pack/pack-source.ts";
import { SearchIndex } from "../lib/search/search-index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Reuses the CLI's own committed fixture (see cli/fixtures/sample-county.ndjson) rather than a
// second copy, so this integration test can't silently drift from what the CLI actually produces.
const FIXTURE = path.join(__dirname, "../cli/fixtures/sample-county.ndjson");

describe("SearchIndex, against a real pack built from the shared fixture", () => {
    let index: SearchIndex;

    beforeAll(async () => {
        const { pack } = await buildPack({ inputFiles: [FIXTURE], region: "AZ" });
        index = await SearchIndex.open(new InMemoryPackSource(new Uint8Array(pack)));
    });

    it("resolves an exact house number on the correctly-disambiguated street", async () => {
        // "MAIN ST" and "N MAIN ST" are distinct streets in the fixture — 123 exists on both
        // ("123 Main Street" and, via the "123A" row, only as 123A on N Main St), so this proves
        // the directional isn't being dropped anywhere in the pipeline.
        const results = await index.search("123 Main St");
        expect(results).toHaveLength(1);
        expect(results[0]!.streetDisplay).toBe("Main St");
        expect(results[0]!.number).toBe(123);
        expect(results[0]!.numberExtra).toBe("");
        expect(results[0]!.matchedVia).toBe("exact");
        expect(results[0]!.numberMatchedVia).toBe("exact");
    });

    it("keeps N MAIN ST separate and resolves its alphanumeric number", async () => {
        const results = await index.search("123 N Main Street");
        expect(results).toHaveLength(1);
        expect(results[0]!.streetDisplay).toBe("N Main St");
        expect(results[0]!.numberExtra).toBe("A");
    });

    it("collapses units to the base address and carries the unit list", async () => {
        const results = await index.search("200 Elm St");
        expect(results).toHaveLength(1);
        expect(results[0]!.units.sort()).toEqual(["1", "2"]);
        expect(results[0]!.number).toBe(200);
    });

    it("resolves a fuzzy (typo'd) street name", async () => {
        const results = await index.search("500 Ceder Lane");
        expect(results.length).toBeGreaterThan(0);
        expect(results[0]!.streetDisplay).toBe("Cedar Ln");
        expect(results[0]!.matchedVia).toBe("fuzzy");
        expect(results[0]!.numberMatchedVia).toBe("exact");
    });

    it("handles a street-only query with no house number", async () => {
        const results = await index.search("S Oak Ave");
        expect(results).toHaveLength(1);
        expect(results[0]!.number).toBe(100); // lowest number on the street, per the documented fallback
        expect(results[0]!.numberMatchedVia).toBe("nearest");
    });

    it("falls back to the nearest number when the exact one doesn't exist", async () => {
        const results = await index.search("101 S Oak Ave");
        expect(results).toHaveLength(1);
        expect(results[0]!.numberMatchedVia).toBe("nearest");
        expect([100, 102]).toContain(results[0]!.number);
    });

    it("filters by place hint", async () => {
        const results = await index.search("500 Cedar Ln, Chandler");
        expect(results).toHaveLength(1);
        expect(results[0]!.city).toBe("Chandler");
    });

    it("ranks by distance to a reference point when given one", async () => {
        // Mesa addresses are much closer to this point than the Chandler/Gilbert ones.
        const results = await index.search("Main St", { reference: { lat: 33.415, lon: -111.845 }, limit: 5 });
        expect(results[0]!.distanceMeters).not.toBeNull();
    });

    it("returns no results for an unmatched street", async () => {
        expect(await index.search("999 Nonexistent Boulevard")).toEqual([]);
    });

    it("returns no results for a query with no street text at all", async () => {
        expect(await index.search("12345")).toEqual([]);
    });
});

describe("SearchIndex.reverseLookup, against the same real pack (PLAN.md §4.2)", () => {
    let index: SearchIndex;

    beforeAll(async () => {
        const { pack } = await buildPack({ inputFiles: [FIXTURE], region: "AZ" });
        index = await SearchIndex.open(new InMemoryPackSource(new Uint8Array(pack)));
    });

    it("finds the nearest address to a point exactly on a known address", async () => {
        const [known] = await index.search("123 Main St");
        const hit = await index.reverseLookup({ lat: known!.lat, lon: known!.lon });
        expect(hit).toBeDefined();
        expect(hit!.displayAddress).toBe(known!.displayAddress);
        expect(hit!.matchedVia).toBe("reverse");
        expect(hit!.distanceMeters).toBeCloseTo(0, 1);
    });

    it("finds the nearest address to a point offset by a few metres, not just an exact hit", async () => {
        const [known] = await index.search("123 Main St");
        // ~5m north — comfortably inside the same cell, well under the 450m guarantee.
        const hit = await index.reverseLookup({ lat: known!.lat + 0.00005, lon: known!.lon });
        expect(hit).toBeDefined();
        expect(hit!.displayAddress).toBe(known!.displayAddress);
    });

    it("returns undefined far from any data, after exhausting the widened radius", async () => {
        expect(await index.reverseLookup({ lat: 0, lon: 0 })).toBeUndefined();
    });
});
