import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { buildPack, type BuildResult } from "../src/pack/build.ts";
import { readPackManifest, readSection, getSection } from "../src/pack/container.ts";
import { decodeStringTable } from "../src/pack/strings.ts";
import { decodeGroups } from "../src/pack/groups.ts";
import { decodeChunk } from "../src/pack/chunks.ts";
import { decodeCellDir, decodeCellList, cellKeyOf } from "../src/pack/cells.ts";
import { parseOpenAddressesFiles } from "../src/ingest/openaddresses.ts";
import { normalizeFeature, dedupeKey } from "../src/ingest/normalize.ts";
import { placeNameFor } from "../src/pack/places.ts";
import type { NormalizedAddress } from "../src/pack/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "../fixtures/sample-county.ndjson");
const CELL_SIZE = 0.005;

async function loadExpectedAddresses(): Promise<NormalizedAddress[]> {
    const seen = new Set<string>();
    const out: NormalizedAddress[] = [];
    for await (const line of parseOpenAddressesFiles([FIXTURE])) {
        if (!line.ok) continue;
        const normalized = normalizeFeature(line.feature);
        if (!normalized) continue;
        const key = dedupeKey(normalized);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(normalized);
    }
    return out;
}

describe("pack container round-trip", () => {
    let result: BuildResult;
    let expected: NormalizedAddress[];

    beforeAll(async () => {
        result = await buildPack({ inputFiles: [FIXTURE], region: "TEST" });
        expected = await loadExpectedAddresses();
    });

    it("drops the three malformed fixture rows and dedupes the one exact duplicate", () => {
        // fixtures/sample-county.ndjson has 15 lines: 3 are malformed (no number, no street, non-Point
        // geometry) and 1 is an exact duplicate of another — see the file's own row-by-row intent.
        expect(result.stats.rawFeatureCount).toBe(15);
        expect(result.stats.droppedCount).toBe(3);
        expect(result.stats.dedupedCount).toBe(1);
        expect(result.stats.addressCount).toBe(15 - 3 - 1);
        expect(expected).toHaveLength(result.stats.addressCount);
    });

    it("round-trips magic/version/manifest", () => {
        const manifest = readPackManifest(result.pack);
        expect(manifest.region).toBe("TEST");
        expect(manifest.addressCount).toBe(result.stats.addressCount);
        expect(manifest.cellSizeDeg).toBe(CELL_SIZE);
    });

    it("chunk row counts sum to the total address count", () => {
        const manifest = readPackManifest(result.pack);
        const chunkSections = manifest.sections.filter((s) => s.id.startsWith("chunk:"));
        expect(chunkSections).toHaveLength(result.stats.chunkCount);
        const totalRows = chunkSections.reduce((sum, s) => sum + (s.count ?? 0), 0);
        expect(totalRows).toBe(result.stats.addressCount);
    });

    it("streets table is sorted and matches the distinct match-forms in the input", () => {
        const manifest = readPackManifest(result.pack);
        const streetsBuf = readSection(result.pack, getSection(manifest, "streets"));
        const streets = decodeStringTable(streetsBuf);

        const expectedStreets = [...new Set(expected.map((a) => a.streetMatch))].sort();
        expect(streets).toEqual(expectedStreets);
    });

    it("every expected address is recoverable from its group's chunk with matching fields", () => {
        const manifest = readPackManifest(result.pack);
        const streets = decodeStringTable(readSection(result.pack, getSection(manifest, "streets")));
        const places = decodeStringTable(readSection(result.pack, getSection(manifest, "places")));
        const units = decodeStringTable(readSection(result.pack, getSection(manifest, "units")));
        const numberExtras = decodeStringTable(readSection(result.pack, getSection(manifest, "numberExtra")));
        const groups = decodeGroups(
            readSection(result.pack, getSection(manifest, "groups")),
            manifest.sections.find((s) => s.id === "groups")!.count!,
        );

        const chunkCache = new Map<number, ReturnType<typeof decodeChunk>>();
        const rowsFor = (chunkId: number) => {
            let rows = chunkCache.get(chunkId);
            if (!rows) {
                const section = getSection(manifest, `chunk:${chunkId}`);
                rows = decodeChunk(readSection(result.pack, section), section.count!);
                chunkCache.set(chunkId, rows);
            }
            return rows;
        };

        for (const addr of expected) {
            const streetId = streets.indexOf(addr.streetMatch);
            const placeId = places.indexOf(placeNameFor(addr));
            const postcodeId = places.indexOf(addr.postcode);
            expect(streetId).toBeGreaterThanOrEqual(0);

            const group = groups.find(
                (g) => g.streetId === streetId && g.placeId === placeId && g.postcodeId === postcodeId,
            );
            expect(group, `no group for ${addr.streetMatch}/${placeNameFor(addr)}`).toBeDefined();

            const rows = rowsFor(group!.chunkId).slice(group!.rowOffset, group!.rowOffset + group!.rowCount);
            const match = rows.find((r) => {
                const lat = group!.centroidLatE7 / 1e7 + r.latD / 1e7;
                const lon = group!.centroidLonE7 / 1e7 + r.lonD / 1e7;
                return (
                    r.number === addr.number &&
                    numberExtras[r.numExtra] === addr.numberExtra &&
                    units[r.unitRef] === addr.unit &&
                    Math.abs(lat - addr.lat) < 1e-6 &&
                    Math.abs(lon - addr.lon) < 1e-6
                );
            });
            expect(match, `no chunk row matched ${addr.streetMatch} #${addr.number}${addr.numberExtra}`).toBeDefined();
        }
    });

    it("reverse-geocode cell index covers every address exactly once", () => {
        const manifest = readPackManifest(result.pack);
        const cellDirSection = getSection(manifest, "cellDir");
        const { cellKeys, listOffsets } = decodeCellDir(readSection(result.pack, cellDirSection), cellDirSection.count!);
        const cellListsBuf = readSection(result.pack, getSection(manifest, "cellLists"));

        let totalOrdinals = 0;
        for (let i = 0; i < cellKeys.length; i++) {
            totalOrdinals += decodeCellList(cellListsBuf, listOffsets[i]!, listOffsets[i + 1]!).length;
        }
        expect(totalOrdinals).toBe(result.stats.addressCount);

        // Every expected address's cell key must actually be present in cellDir.
        const cellKeySet = new Set(cellKeys);
        for (const addr of expected) {
            expect(cellKeySet.has(cellKeyOf(addr.lat, addr.lon, manifest.cellSizeDeg))).toBe(true);
        }
    });

    it("rejects a pack with a corrupted section checksum", () => {
        const manifest = readPackManifest(result.pack);
        const streetsSection = getSection(manifest, "streets");
        const corrupted = Buffer.from(result.pack);
        corrupted[streetsSection.byteOffset] = corrupted[streetsSection.byteOffset]! ^ 0xff;
        expect(() => readSection(corrupted, streetsSection)).toThrow(/checksum/);
    });
});
