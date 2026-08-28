import { gunzipSync, gzipSync } from "node:zlib";
import type { NormalizedAddress } from "./types.ts";
import type { GroupDraft } from "./groups.ts";
import { StringInterner } from "./strings.ts";
import { buildUnitInterner } from "./units.ts";
import { ensureAligned } from "./bytes.ts";

/** Uncompressed byte budget per chunk. A single oversized group still gets its own chunk. */
const DEFAULT_CHUNK_BYTE_BUDGET = 2 * 1024 * 1024;
const BYTES_PER_ROW = 20; // number, latD, lonD, unitRef, numExtra — 5 x uint32/int32

export interface GroupPlacement {
    chunkId: number;
    rowOffset: number;
    rowCount: number;
    centroidLatE7: number;
    centroidLonE7: number;
}

export interface EncodedChunk {
    id: number;
    rowCount: number;
    /** Global ordinal (across all chunks, in chunk order) of this chunk's first row. */
    firstGlobalOrdinal: number;
    compressed: Buffer;
    uncompressedByteLength: number;
}

export interface ChunkBuildResult {
    chunks: EncodedChunk[];
    placementByGroupIndex: GroupPlacement[];
    unitTable: string[];
    numberExtraTable: string[];
}

function toE7(deg: number): number {
    return Math.round(deg * 1e7);
}

export function buildChunks(
    addresses: readonly NormalizedAddress[],
    groups: readonly GroupDraft[],
    chunkByteBudget = DEFAULT_CHUNK_BYTE_BUDGET,
): ChunkBuildResult {
    const unitInterner = buildUnitInterner();
    const numberExtraInterner = new StringInterner();
    numberExtraInterner.intern(""); // id 0 = plain numeric number

    const chunks: EncodedChunk[] = [];
    const placementByGroupIndex: GroupPlacement[] = new Array(groups.length);

    let globalOrdinal = 0;
    let chunkId = 0;
    let pendingGroupStart = 0;
    let pendingRowCount = 0;

    const flushChunk = (groupEnd: number) => {
        if (pendingRowCount === 0) return;

        const number = new Uint32Array(pendingRowCount);
        const latD = new Int32Array(pendingRowCount);
        const lonD = new Int32Array(pendingRowCount);
        const unitRef = new Uint32Array(pendingRowCount);
        const numExtra = new Uint32Array(pendingRowCount);

        let row = 0;
        const firstGlobalOrdinal = globalOrdinal;

        for (let gi = pendingGroupStart; gi < groupEnd; gi++) {
            const group = groups[gi]!;
            const rowOffset = row;
            for (const addrIdx of group.memberIndices) {
                const addr = addresses[addrIdx]!;
                number[row] = addr.number;
                latD[row] = toE7(addr.lat - group.centroidLat);
                lonD[row] = toE7(addr.lon - group.centroidLon);
                unitRef[row] = unitInterner.intern(addr.unit);
                numExtra[row] = numberExtraInterner.intern(addr.numberExtra);
                row++;
            }
            placementByGroupIndex[gi] = {
                chunkId,
                rowOffset,
                rowCount: group.memberIndices.length,
                centroidLatE7: toE7(group.centroidLat),
                centroidLonE7: toE7(group.centroidLon),
            };
        }

        const raw = Buffer.concat([
            Buffer.from(number.buffer, number.byteOffset, number.byteLength),
            Buffer.from(latD.buffer, latD.byteOffset, latD.byteLength),
            Buffer.from(lonD.buffer, lonD.byteOffset, lonD.byteLength),
            Buffer.from(unitRef.buffer, unitRef.byteOffset, unitRef.byteLength),
            Buffer.from(numExtra.buffer, numExtra.byteOffset, numExtra.byteLength),
        ]);

        chunks.push({
            id: chunkId,
            rowCount: pendingRowCount,
            firstGlobalOrdinal,
            compressed: gzipSync(raw),
            uncompressedByteLength: raw.byteLength,
        });

        globalOrdinal += pendingRowCount;
        chunkId++;
        pendingGroupStart = groupEnd;
        pendingRowCount = 0;
    };

    groups.forEach((group, gi) => {
        const groupBytes = group.memberIndices.length * BYTES_PER_ROW;
        const wouldExceed = pendingRowCount > 0 && (pendingRowCount * BYTES_PER_ROW + groupBytes) > chunkByteBudget;
        if (wouldExceed) flushChunk(gi);
        pendingRowCount += group.memberIndices.length;
    });
    flushChunk(groups.length);

    return {
        chunks,
        placementByGroupIndex,
        unitTable: unitInterner.toArray(),
        numberExtraTable: numberExtraInterner.toArray(),
    };
}

export interface DecodedChunkRow {
    number: number;
    latD: number;
    lonD: number;
    unitRef: number;
    numExtra: number;
}

/** Inverse of the per-chunk encoding above. Decompresses and reads back all `rowCount` rows. */
export function decodeChunk(gzipped: Buffer, rowCount: number): DecodedChunkRow[] {
    const raw = ensureAligned(gunzipSync(gzipped));
    const bytesPerArray = rowCount * 4;

    let cursor = raw.byteOffset;
    const view = (Ctor: typeof Uint32Array | typeof Int32Array) => {
        const arr = new Ctor(raw.buffer as ArrayBuffer, cursor, rowCount);
        cursor += bytesPerArray;
        return arr;
    };

    const number = view(Uint32Array);
    const latD = view(Int32Array);
    const lonD = view(Int32Array);
    const unitRef = view(Uint32Array);
    const numExtra = view(Uint32Array);

    const rows: DecodedChunkRow[] = new Array(rowCount);
    for (let i = 0; i < rowCount; i++) {
        rows[i] = { number: number[i]!, latD: latD[i]!, lonD: lonD[i]!, unitRef: unitRef[i]!, numExtra: numExtra[i]! };
    }
    return rows;
}
