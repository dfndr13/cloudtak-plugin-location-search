import type { NormalizedGazetteerRecord } from "./types.ts";
import { DEFAULT_GAZETTEER_CELL_SIZE_DEG } from "./types.ts";
import { parseGnisFiles, dedupeGazetteerKey, type ParseGnisOptions } from "../ingest/gnis.ts";
import { StringInterner, encodeStringTable } from "./strings.ts";
import { buildGazetteerChunks } from "./gazetteer-chunks.ts";
import { buildTrigramPostings, encodeTrigramPostings } from "./trigrams.ts";
import { buildCellIndex, encodeCellDir, encodeCellLists, type CellEntry } from "./cells.ts";
import { writeGazetteerPack, type SectionInput } from "./container.ts";

/** One ingested row from any gazetteer source — `ParsedGnisLine` and `ParsedGeojsonPlace` both fit. */
export type GazetteerIngestLine = { ok: true; record: NormalizedGazetteerRecord } | { ok: false; reason: string };

export interface GazetteerBuildOptions {
    inputFiles: readonly string[];
    /** Rows to build from instead of parsing `inputFiles` as GNIS (e.g. `parseGeojsonPlaceFiles`). */
    source?: AsyncIterable<GazetteerIngestLine>;
    region: string;
    sourceName: string;
    cellSizeDeg?: number;
    classes?: ParseGnisOptions["classes"];
    chunkRowBudget?: number;
}

export interface GazetteerBuildStats {
    rawFeatureCount: number;
    filteredCount: number;
    droppedCount: number;
    dedupedCount: number;
    recordCount: number;
    nameCount: number;
    classCount: number;
    placeCount: number;
    chunkCount: number;
    cellCount: number;
    trigramCount: number;
    timings: Record<string, number>;
    sectionSizes: { id: string; byteLength: number; compressed: boolean }[];
    totalByteLength: number;
}

export interface GazetteerBuildResult {
    pack: Buffer;
    stats: GazetteerBuildStats;
}

/** Sorted, deduped name table — mirrors `streets.ts`'s `buildStreetTable` shape/rationale, own
 *  copy since gazetteer records have no group layer to derive it from. */
function buildNameTable(records: readonly NormalizedGazetteerRecord[]) {
    const displayByMatch = new Map<string, string>();
    for (const r of records) {
        if (!displayByMatch.has(r.nameMatch)) displayByMatch.set(r.nameMatch, r.nameDisplay);
    }
    const nameMatchForms = [...displayByMatch.keys()].sort();
    const nameDisplayForms = nameMatchForms.map((m) => displayByMatch.get(m)!);
    const nameIdOf = new Map(nameMatchForms.map((m, i) => [m, i]));
    return { nameMatchForms, nameDisplayForms, nameIdOf };
}

export async function buildGazetteerPack(opts: GazetteerBuildOptions): Promise<GazetteerBuildResult> {
    const cellSizeDeg = opts.cellSizeDeg ?? DEFAULT_GAZETTEER_CELL_SIZE_DEG;
    const timings: Record<string, number> = {};
    const time = <T>(label: string, fn: () => T): T => {
        const start = performance.now();
        const result = fn();
        timings[label] = performance.now() - start;
        return result;
    };

    // 1. Ingest + normalize + class-filter + dedupe.
    const ingestStart = performance.now();
    const seen = new Set<string>();
    const records: NormalizedGazetteerRecord[] = [];
    let rawFeatureCount = 0;
    let filteredCount = 0;
    let droppedCount = 0;
    let dedupedCount = 0;

    const source = opts.source ?? parseGnisFiles(opts.inputFiles, { classes: opts.classes });
    for await (const line of source) {
        rawFeatureCount++;
        if (!line.ok) {
            if (line.reason === "filtered-class" || line.reason === "filtered") filteredCount++;
            else droppedCount++;
            continue;
        }
        const key = dedupeGazetteerKey(line.record);
        if (seen.has(key)) {
            dedupedCount++;
            continue;
        }
        seen.add(key);
        records.push(line.record);
    }
    timings.ingest = performance.now() - ingestStart;

    // 2. Names, classes, places — every record directly carries an FK into each (no group layer).
    const { nameMatchForms, nameDisplayForms, nameIdOf } = time("names", () => buildNameTable(records));
    const classInterner = new StringInterner();
    const placeInterner = new StringInterner();
    placeInterner.intern(""); // id 0 = none, same convention as address places.ts

    const { nameIds, classIds, countyIds, stateIds } = time("classes+places", () => ({
        nameIds: records.map((r) => nameIdOf.get(r.nameMatch)!),
        classIds: records.map((r) => classInterner.intern(r.featureClass)),
        countyIds: records.map((r) => placeInterner.intern(r.county)),
        stateIds: records.map((r) => placeInterner.intern(r.state)),
    }));

    // 3. Chunks — flat, fixed row count, no group-boundary constraint (gazetteer-chunks.ts).
    const chunkResult = time("chunks", () =>
        buildGazetteerChunks(records, nameIds, classIds, countyIds, stateIds, opts.chunkRowBudget),
    );

    // 4. Trigram postings over every RECORD's match-form (not the deduped name table) — postings
    //    resolve directly to a record's global ordinal, matching gnCellLists' ordinal space and
    //    skipping the street->group->chunk indirection the address format needs.
    const trigrams = time("trigrams", () => buildTrigramPostings(records.map((r) => r.nameMatch)));

    // 5. Reverse-geocode cell index — ordinal = record array index, since chunk placement never
    //    reorders records (gazetteer-chunks.ts's own doc comment).
    const cellEntries: CellEntry[] = time("cellEntries", () =>
        records.map((r, i) => ({ lat: r.lat, lon: r.lon, ordinal: i })),
    );
    const cellIndex = time("cells", () => buildCellIndex(cellEntries, cellSizeDeg));
    const { blob: cellListsBlob, byteLengths: cellListByteLengths } = encodeCellLists(cellIndex.ordinalsByCell);
    const cellDirBuf = encodeCellDir(cellIndex.cellKeys, cellListByteLengths);

    // 6. Assemble sections and write the container.
    const sections: SectionInput[] = [
        { id: "gnNames", kind: "string-table", bytes: encodeStringTable(nameMatchForms), compressed: false, count: nameMatchForms.length },
        { id: "gnNamesDisplay", kind: "string-table", bytes: encodeStringTable(nameDisplayForms), compressed: false, count: nameDisplayForms.length },
        { id: "gnClasses", kind: "string-table", bytes: encodeStringTable(classInterner.toArray()), compressed: false, count: classInterner.size },
        { id: "gnPlaces", kind: "string-table", bytes: encodeStringTable(placeInterner.toArray()), compressed: false, count: placeInterner.size },
        { id: "gnTrigrams", kind: "trigram-postings-v1", bytes: encodeTrigramPostings(trigrams), compressed: false, count: trigrams.trigramKeys.length },
        { id: "gnCellDir", kind: "cell-dir-v1", bytes: cellDirBuf, compressed: false, count: cellIndex.cellKeys.length },
        { id: "gnCellLists", kind: "cell-lists-v1", bytes: cellListsBlob, compressed: false },
        ...chunkResult.chunks.map((c): SectionInput => ({
            id: `gnChunk:${c.id}`,
            kind: "gazetteer-chunk-v1",
            bytes: c.compressed,
            compressed: true,
            count: c.rowCount,
        })),
    ];

    const pack = time("write", () =>
        writeGazetteerPack(sections, {
            region: opts.region,
            sourceName: opts.sourceName,
            recordCount: records.length,
            cellSizeDeg,
        }),
    );

    const stats: GazetteerBuildStats = {
        rawFeatureCount,
        filteredCount,
        droppedCount,
        dedupedCount,
        recordCount: records.length,
        nameCount: nameMatchForms.length,
        classCount: classInterner.size,
        placeCount: placeInterner.size,
        chunkCount: chunkResult.chunks.length,
        cellCount: cellIndex.cellKeys.length,
        trigramCount: trigrams.trigramKeys.length,
        timings,
        sectionSizes: sections.map((s) => ({ id: s.id, byteLength: s.bytes.byteLength, compressed: s.compressed })),
        totalByteLength: pack.byteLength,
    };

    return { pack, stats };
}
