import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { buildGazetteerPack } from "../cli/src/pack/gazetteer.ts";
import { parseGeojsonPlaceFiles } from "../cli/src/ingest/geojson-places.ts";
import { InMemoryPackSource } from "../lib/pack/pack-source.ts";
import { readGazetteerManifest } from "../lib/pack/container.ts";
import { GazetteerIndex } from "../lib/search/gazetteer-index.ts";
import type { GazetteerManifest } from "../lib/pack/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "../cli/fixtures/sample-parcels.geojson");

describe("GazetteerIndex over a parcel pack built by build-geojson-places", () => {
    let index: GazetteerIndex;

    beforeAll(async () => {
        const { pack } = await buildGazetteerPack({
            inputFiles: [FIXTURE],
            source: parseGeojsonPlaceFiles([FIXTURE], {
                nameTemplate: "WWR {name}",
                classTemplate: "Lot",
                countyTemplate: "APN {APN}",
                stateTemplate: "AZ",
                where: { OWNERORMAN: "Private" },
            }),
            region: "WWR",
            sourceName: "WWR parcels (test fixture)",
        });
        index = await GazetteerIndex.open(new InMemoryPackSource<GazetteerManifest>(new Uint8Array(pack), readGazetteerManifest));
    });

    it("finds a lot by its exact name, case-insensitively, at the lot centroid", async () => {
        const results = await index.search("wwr 101");
        expect(results[0]!.displayAddress).toBe("WWR 101 — Lot, APN 1001, AZ");
        expect(results[0]!.matchedVia).toBe("exact");
        expect(results[0]!.lat).toBeCloseTo(35.005, 5);
        expect(results[0]!.lon).toBeCloseTo(-111.995, 5);
    });

    it("returns every parcel sharing a lot number, told apart by APN", async () => {
        const results = await index.search("WWR 104");
        expect(results.map((r) => r.county).sort()).toEqual(["APN 1004A", "APN 1004B"]);
    });

    it("ranks the intended lot first when WWR is mistyped as www", async () => {
        const results = await index.search("www 101");
        expect(results[0]!.displayAddress.startsWith("WWR 101")).toBe(true);
    });

    it("excludes features filtered out by --where", async () => {
        const results = await index.search("WWR 103");
        expect(results.some((r) => r.displayAddress.startsWith("WWR 103"))).toBe(false);
    });
});
