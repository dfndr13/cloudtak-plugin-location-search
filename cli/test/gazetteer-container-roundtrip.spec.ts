import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { buildGazetteerPack, type GazetteerBuildResult } from "../src/pack/gazetteer.ts";
import { buildPack } from "../src/pack/build.ts";
import { readGazetteerManifest, readPackManifest, readSection, getSection } from "../src/pack/container.ts";
import { decodeStringTable } from "../src/pack/strings.ts";
import { decodeGazetteerChunk } from "../src/pack/gazetteer-chunks.ts";
import { decodeCellDir, decodeCellList, cellKeyOf } from "../src/pack/cells.ts";
import { PACK_VERSION_GAZETTEER } from "../src/pack/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "../fixtures/sample-gnis.txt");

describe("gazetteer pack container round-trip", () => {
    let result: GazetteerBuildResult;

    beforeAll(async () => {
        result = await buildGazetteerPack({
            inputFiles: [FIXTURE],
            region: "TEST",
            sourceName: "USGS GNIS (test fixture)",
        });
    });

    it("keeps 7 records after class filtering, drops, and dedup", () => {
        expect(result.stats.rawFeatureCount).toBe(12);
        expect(result.stats.filteredCount).toBe(1);
        expect(result.stats.droppedCount).toBe(3);
        expect(result.stats.dedupedCount).toBe(1);
        expect(result.stats.recordCount).toBe(7);
    });

    it("round-trips magic/version/manifest as a version-2 gazetteer pack", () => {
        const manifest = readGazetteerManifest(result.pack);
        expect(manifest.version).toBe(PACK_VERSION_GAZETTEER);
        expect(manifest.region).toBe("TEST");
        expect(manifest.sourceName).toBe("USGS GNIS (test fixture)");
        expect(manifest.recordCount).toBe(7);
    });

    it("gnChunk row counts sum to the record count", () => {
        const manifest = readGazetteerManifest(result.pack);
        const chunkSections = manifest.sections.filter((s) => s.id.startsWith("gnChunk:"));
        expect(chunkSections).toHaveLength(result.stats.chunkCount);
        const totalRows = chunkSections.reduce((sum, s) => sum + (s.count ?? 0), 0);
        expect(totalRows).toBe(7);
    });

    it("gnNames is sorted and has one entry per distinct name (no collisions in this fixture)", () => {
        const manifest = readGazetteerManifest(result.pack);
        const names = decodeStringTable(readSection(result.pack, getSection(manifest, "gnNames")));
        expect(names).toHaveLength(7);
        expect(names).toEqual([...names].sort());
    });

    it("every record is recoverable from its chunk with matching class/place/coordinates", () => {
        const manifest = readGazetteerManifest(result.pack);
        const namesDisplay = decodeStringTable(readSection(result.pack, getSection(manifest, "gnNamesDisplay")));
        const classes = decodeStringTable(readSection(result.pack, getSection(manifest, "gnClasses")));
        const places = decodeStringTable(readSection(result.pack, getSection(manifest, "gnPlaces")));

        const allRows = manifest.sections
            .filter((s) => s.id.startsWith("gnChunk:"))
            .flatMap((s) => decodeGazetteerChunk(readSection(result.pack, s), s.count!));
        expect(allRows).toHaveLength(7);

        const mountElden = allRows.find((r) => namesDisplay[r.nameId] === "Mount Elden");
        expect(mountElden).toBeDefined();
        expect(classes[mountElden!.classId]).toBe("Summit");
        expect(places[mountElden!.countyId]).toBe("Coconino");
        expect(places[mountElden!.stateId]).toBe("AZ");
        expect(mountElden!.lat).toBeCloseTo(35.24, 4);
        expect(mountElden!.lon).toBeCloseTo(-111.61, 4);

        const canonCity = allRows.find((r) => namesDisplay[r.nameId] === "Cañon City");
        expect(classes[canonCity!.classId]).toBe("Populated Place");
        expect(places[canonCity!.countyId]).toBe("Yavapai");
    });

    it("reverse-geocode cell index covers every record exactly once", () => {
        const manifest = readGazetteerManifest(result.pack);
        const cellDirSection = getSection(manifest, "gnCellDir");
        const { cellKeys, listOffsets } = decodeCellDir(readSection(result.pack, cellDirSection), cellDirSection.count!);
        const cellListsBuf = readSection(result.pack, getSection(manifest, "gnCellLists"));

        let total = 0;
        for (let i = 0; i < cellKeys.length; i++) {
            total += decodeCellList(cellListsBuf, listOffsets[i]!, listOffsets[i + 1]!).length;
        }
        expect(total).toBe(7);

        const cellKeySet = new Set(cellKeys);
        expect(cellKeySet.has(cellKeyOf(35.24, -111.61, manifest.cellSizeDeg))).toBe(true);
    });

    it("rejects a gazetteer pack with a corrupted section checksum", () => {
        const manifest = readGazetteerManifest(result.pack);
        const section = getSection(manifest, "gnNames");
        const corrupted = Buffer.from(result.pack);
        corrupted[section.byteOffset] = corrupted[section.byteOffset]! ^ 0xff;
        expect(() => readSection(corrupted, section)).toThrow(/checksum/);
    });

    it("the address-pack reader refuses to read a gazetteer pack, and vice versa", async () => {
        expect(() => readPackManifest(result.pack)).toThrow(/version/);

        const addressFixture = path.join(__dirname, "../fixtures/sample-county.ndjson");
        const addressResult = await buildPack({ inputFiles: [addressFixture], region: "TEST" });
        expect(() => readGazetteerManifest(addressResult.pack)).toThrow(/version/);
    });
});
