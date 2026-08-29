/**
 * Chunker for gazetteer (place-name) records — `kind: "gazetteer-chunk-v1"`, section ids
 * `gnChunk:<n>`. Unlike `chunks.ts`'s address chunker, there is no group/house-number hierarchy
 * to bucket by and no owning-centroid to delta-encode against, so this is deliberately simpler:
 * a fixed row count per chunk, splitting anywhere, absolute (not delta) coordinates. Row order is
 * never reshuffled, so a record's array index IS its global ordinal — the same ordinal space
 * `gnTrigrams` postings and `gnCellLists` use (see docs/PACK_FORMAT.md).
 */
import { gunzipSync, gzipSync } from "node:zlib";
import type { NormalizedGazetteerRecord } from "./types.ts";
import { ensureAligned } from "./bytes.ts";

const DEFAULT_CHUNK_ROW_BUDGET = 100_000;

export interface EncodedGazetteerChunk {
    id: number;
    rowCount: number;
    /** Global ordinal (across all chunks, in chunk order) of this chunk's first row — equal to
     *  the record's own array index, since chunks are contiguous slices in original order. */
    firstGlobalOrdinal: number;
    compressed: Buffer;
    uncompressedByteLength: number;
}

function toE7(deg: number): number {
    return Math.round(deg * 1e7);
}

export function buildGazetteerChunks(
    records: readonly NormalizedGazetteerRecord[],
    nameIds: readonly number[],
    classIds: readonly number[],
    countyIds: readonly number[],
    stateIds: readonly number[],
    chunkRowBudget = DEFAULT_CHUNK_ROW_BUDGET,
): { chunks: EncodedGazetteerChunk[] } {
    const chunks: EncodedGazetteerChunk[] = [];
    let cursor = 0;
    let chunkId = 0;

    while (cursor < records.length) {
        const rowCount = Math.min(chunkRowBudget, records.length - cursor);
        const nameId = new Uint32Array(rowCount);
        const classId = new Uint32Array(rowCount);
        const countyId = new Uint32Array(rowCount);
        const stateId = new Uint32Array(rowCount);
        const lat = new Int32Array(rowCount);
        const lon = new Int32Array(rowCount);

        for (let i = 0; i < rowCount; i++) {
            const gi = cursor + i;
            nameId[i] = nameIds[gi]!;
            classId[i] = classIds[gi]!;
            countyId[i] = countyIds[gi]!;
            stateId[i] = stateIds[gi]!;
            lat[i] = toE7(records[gi]!.lat);
            lon[i] = toE7(records[gi]!.lon);
        }

        const raw = Buffer.concat([
            Buffer.from(nameId.buffer, nameId.byteOffset, nameId.byteLength),
            Buffer.from(classId.buffer, classId.byteOffset, classId.byteLength),
            Buffer.from(countyId.buffer, countyId.byteOffset, countyId.byteLength),
            Buffer.from(stateId.buffer, stateId.byteOffset, stateId.byteLength),
            Buffer.from(lat.buffer, lat.byteOffset, lat.byteLength),
            Buffer.from(lon.buffer, lon.byteOffset, lon.byteLength),
        ]);

        chunks.push({
            id: chunkId,
            rowCount,
            firstGlobalOrdinal: cursor,
            compressed: gzipSync(raw),
            uncompressedByteLength: raw.byteLength,
        });

        cursor += rowCount;
        chunkId++;
    }

    return { chunks };
}

export interface DecodedGazetteerRow {
    nameId: number;
    classId: number;
    countyId: number;
    stateId: number;
    lat: number;
    lon: number;
}

/** Inverse of the encoding above. Decompresses and reads back all `rowCount` rows. */
export function decodeGazetteerChunk(gzipped: Buffer, rowCount: number): DecodedGazetteerRow[] {
    const raw = ensureAligned(gunzipSync(gzipped));
    const bytesPerArray = rowCount * 4;

    let cursor = raw.byteOffset;
    const view = (Ctor: typeof Uint32Array | typeof Int32Array) => {
        const arr = new Ctor(raw.buffer as ArrayBuffer, cursor, rowCount);
        cursor += bytesPerArray;
        return arr;
    };

    const nameId = view(Uint32Array);
    const classId = view(Uint32Array);
    const countyId = view(Uint32Array);
    const stateId = view(Uint32Array);
    const lat = view(Int32Array);
    const lon = view(Int32Array);

    const rows: DecodedGazetteerRow[] = new Array(rowCount);
    for (let i = 0; i < rowCount; i++) {
        rows[i] = {
            nameId: nameId[i]!,
            classId: classId[i]!,
            countyId: countyId[i]!,
            stateId: stateId[i]!,
            lat: lat[i]! / 1e7,
            lon: lon[i]! / 1e7,
        };
    }
    return rows;
}
