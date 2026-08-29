import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { buildGazetteerPack } from "../cli/src/pack/gazetteer.ts";
import { InMemoryPackSource } from "../lib/pack/pack-source.ts";
import { readGazetteerManifest } from "../lib/pack/container.ts";
import { GazetteerIndex } from "../lib/search/gazetteer-index.ts";
import type { GazetteerManifest } from "../lib/pack/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Reuses the CLI's own committed fixture (cli/fixtures/sample-gnis.txt) rather than a second copy
// — same convention as test/search-index.spec.ts's reuse of the address fixture.
const FIXTURE = path.join(__dirname, "../cli/fixtures/sample-gnis.txt");

describe("GazetteerIndex, against a real pack built from the shared fixture", () => {
    let index: GazetteerIndex;

    beforeAll(async () => {
        const { pack } = await buildGazetteerPack({ inputFiles: [FIXTURE], region: "AZ", sourceName: "USGS GNIS (test fixture)" });
        const source = new InMemoryPackSource<GazetteerManifest>(new Uint8Array(pack), readGazetteerManifest);
        index = await GazetteerIndex.open(source);
    });

    it("finds an exact name match", async () => {
        const results = await index.search("Mount Elden");
        expect(results).toHaveLength(1);
        expect(results[0]!.displayAddress).toBe("Mount Elden — Summit, Coconino, AZ");
        expect(results[0]!.matchedVia).toBe("exact");
        expect(results[0]!.sourceKind).toBe("gazetteer");
        expect(results[0]!.featureClass).toBe("Summit");
        expect(results[0]!.county).toBe("Coconino");
        expect(results[0]!.state).toBe("AZ");
        expect(results[0]!.lat).toBeCloseTo(35.24, 4);
        expect(results[0]!.lon).toBeCloseTo(-111.61, 4);
        // Address-only fields stay at their honest empty defaults, never repurposed.
        expect(results[0]!.number).toBe(0);
        expect(results[0]!.city).toBe("");
        expect(results[0]!.units).toEqual([]);
    });

    it("finds a prefix match", async () => {
        const results = await index.search("Mount Eld");
        expect(results).toHaveLength(1);
        expect(results[0]!.matchedVia).toBe("prefix");
    });

    it("finds a fuzzy match for a misspelled name", async () => {
        const results = await index.search("Mont Eldan");
        expect(results.some((r) => r.displayAddress.startsWith("Mount Elden"))).toBe(true);
        const hit = results.find((r) => r.displayAddress.startsWith("Mount Elden"))!;
        expect(hit.matchedVia).toBe("fuzzy");
    });

    it("filters class-excluded and diacritic-normalized names correctly through the full pipeline", async () => {
        const results = await index.search("Canon City");
        expect(results).toHaveLength(1);
        expect(results[0]!.displayAddress).toBe("Cañon City — Populated Place, Yavapai, AZ");
    });

    it("returns no results for a query matching nothing", async () => {
        expect(await index.search("Nonexistent Place Xyz")).toEqual([]);
    });

    it("reverseLookup finds the nearest named place to a clicked point", async () => {
        const hit = await index.reverseLookup({ lat: 35.24, lon: -111.61 });
        expect(hit).toBeDefined();
        expect(hit!.displayAddress).toBe("Mount Elden — Summit, Coconino, AZ");
        expect(hit!.matchedVia).toBe("reverse");
        expect(hit!.distanceMeters).not.toBeNull();
        expect(hit!.distanceMeters!).toBeLessThan(100);
    });

    it("reverseLookup returns undefined far from any loaded data", async () => {
        expect(await index.reverseLookup({ lat: 0, lon: 0 })).toBeUndefined();
    });
});
