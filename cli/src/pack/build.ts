import type { NormalizedAddress } from "./types.ts";
import { DEFAULT_CELL_SIZE_DEG } from "./types.ts";
import { normalizeFeature, dedupeKey } from "../ingest/normalize.ts";
import { parseOpenAddressesFiles } from "../ingest/openaddresses.ts";
import { buildStreetTable } from "./streets.ts";
import { buildPlaceTable } from "./places.ts";
import { buildGroups, encodeGroups } from "./groups.ts";
import { buildChunks } from "./chunks.ts";
import { buildTrigramPostings, encodeTrigramPostings } from "./trigrams.ts";
import { buildCellIndex, encodeCellDir, encodeCellLists, type CellEntry } from "./cells.ts";
import { encodeStringTable } from "./strings.ts";
import { writePack, type SectionInput } from "./container.ts";

export interface BuildOptions {
    inputFiles: readonly string[];
    region: string;
    cellSizeDeg?: number;
    chunkByteBudget?: number;
}

export interface BuildStats {
    rawFeatureCount: number;
    droppedCount: number;
    dedupedCount: number;
    addressCount: number;
    streetCount: number;
    placeCount: number;
    groupCount: number;
    chunkCount: number;
    cellCount: number;
    trigramCount: number;
    timings: Record<string, number>;
    sectionSizes: { id: string; byteLength: number; compressed: boolean }[];
    totalByteLength: number;
}

export interface BuildResult {
    pack: Buffer;
    stats: BuildStats;
}

export async function buildPack(opts: BuildOptions): Promise<BuildResult> {
    const cellSizeDeg = opts.cellSizeDeg ?? DEFAULT_CELL_SIZE_DEG;
    const timings: Record<string, number> = {};
    const time = <T>(label: string, fn: () => T): T => {
        const start = performance.now();
        const result = fn();
        timings[label] = performance.now() - start;
        return result;
    };

    // 1. Ingest + normalize + dedupe.
    const ingestStart = performance.now();
    const seen = new Set<string>();
    const addresses: NormalizedAddress[] = [];
    let rawFeatureCount = 0;
    let droppedCount = 0;
    let dedupedCount = 0;

    for await (const line of parseOpenAddressesFiles(opts.inputFiles)) {
        rawFeatureCount++;
        if (!line.ok) {
            droppedCount++;
            continue;
        }
        const normalized = normalizeFeature(line.feature);
        if (!normalized) {
            droppedCount++;
            continue;
        }
        const key = dedupeKey(normalized);
        if (seen.has(key)) {
            dedupedCount++;
            continue;
        }
        seen.add(key);
        addresses.push(normalized);
    }
    timings.ingest = performance.now() - ingestStart;

    // 2. Streets, places, groups.
    const streets = time("streets", () => buildStreetTable(addresses));
    const places = time("places", () => buildPlaceTable(addresses));
    const groups = time("groups", () => buildGroups(addresses, streets, places));

    // 3. Chunks (also assigns each group's chunkId/rowOffset/rowCount, and interns units/numberExtra).
    const chunkResult = time("chunks", () => buildChunks(addresses, groups, opts.chunkByteBudget));

    // 4. Trigram postings over street match-forms.
    const trigrams = time("trigrams", () => buildTrigramPostings(streets.matchForms));

    // 5. Reverse-geocode cell index. Needs each address's GLOBAL ordinal (position across chunks
    //    in chunk order), which chunk placement determines per-group, not per-address, so expand.
    const cellEntries: CellEntry[] = time("cellEntries", () => {
        const entries: CellEntry[] = new Array(addresses.length);
        let cursor = 0;
        groups.forEach((group, gi) => {
            const placement = chunkResult.placementByGroupIndex[gi]!;
            const chunkBase = chunkResult.chunks[placement.chunkId]!.firstGlobalOrdinal;
            group.memberIndices.forEach((addrIdx, rowInGroup) => {
                const addr = addresses[addrIdx]!;
                const ordinal = chunkBase + placement.rowOffset + rowInGroup;
                entries[cursor++] = { lat: addr.lat, lon: addr.lon, ordinal };
            });
        });
        return entries;
    });
    const cellIndex = time("cells", () => buildCellIndex(cellEntries, cellSizeDeg));
    const { blob: cellListsBlob, byteLengths: cellListByteLengths } = encodeCellLists(cellIndex.ordinalsByCell);
    const cellDirBuf = encodeCellDir(cellIndex.cellKeys, cellListByteLengths);

    // 6. Assemble sections and write the container.
    const sections: SectionInput[] = [
        { id: "streets", kind: "string-table", bytes: encodeStringTable(streets.matchForms), compressed: false, count: streets.matchForms.length },
        { id: "streetsDisplay", kind: "string-table", bytes: encodeStringTable(streets.displayForms), compressed: false, count: streets.displayForms.length },
        { id: "places", kind: "string-table", bytes: encodeStringTable(places.values), compressed: false, count: places.values.length },
        { id: "units", kind: "string-table", bytes: encodeStringTable(chunkResult.unitTable), compressed: false, count: chunkResult.unitTable.length },
        { id: "numberExtra", kind: "string-table", bytes: encodeStringTable(chunkResult.numberExtraTable), compressed: false, count: chunkResult.numberExtraTable.length },
        { id: "groups", kind: "groups-v1", bytes: encodeGroups(groups, chunkResult.placementByGroupIndex), compressed: false, count: groups.length },
        { id: "trigrams", kind: "trigram-postings-v1", bytes: encodeTrigramPostings(trigrams), compressed: false, count: trigrams.trigramKeys.length },
        { id: "cellDir", kind: "cell-dir-v1", bytes: cellDirBuf, compressed: false, count: cellIndex.cellKeys.length },
        { id: "cellLists", kind: "cell-lists-v1", bytes: cellListsBlob, compressed: false },
        ...chunkResult.chunks.map((c): SectionInput => ({
            id: `chunk:${c.id}`,
            kind: "address-chunk-v1",
            bytes: c.compressed,
            compressed: true,
            count: c.rowCount,
        })),
    ];

    const pack = time("write", () => writePack(sections, { region: opts.region, addressCount: addresses.length, cellSizeDeg }));

    const stats: BuildStats = {
        rawFeatureCount,
        droppedCount,
        dedupedCount,
        addressCount: addresses.length,
        streetCount: streets.matchForms.length,
        placeCount: places.values.length,
        groupCount: groups.length,
        chunkCount: chunkResult.chunks.length,
        cellCount: cellIndex.cellKeys.length,
        trigramCount: trigrams.trigramKeys.length,
        timings,
        sectionSizes: sections.map((s) => ({ id: s.id, byteLength: s.bytes.byteLength, compressed: s.compressed })),
        totalByteLength: pack.byteLength,
    };

    return { pack, stats };
}
