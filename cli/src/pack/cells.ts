/**
 * Reverse-geocode cell index (PLAN.md §4.2). Fixed-size grid; only occupied cells are stored.
 * See docs/PACK_FORMAT.md for the on-disk layout. The cell-key math (`cellKeyOf` and friends)
 * lives in `lib/pack/cells.ts`, shared with the search-time reverse-lookup code (Phase 5), so a
 * point's cell key can never disagree between build time and lookup time.
 */
import { ensureAligned } from "./bytes.ts";
import { decodeVarint, encodeVarint } from "./varint.ts";
import { cellKeyOf } from "../../../lib/pack/cells.ts";

export { lonSteps, latIdxOf, lonIdxOf, cellKeyOf, neighbourCellKeys } from "../../../lib/pack/cells.ts";

export interface CellEntry {
    lat: number;
    lon: number;
    ordinal: number;
}

export interface CellIndex {
    /** Sorted ascending. */
    cellKeys: number[];
    /** Parallel to cellKeys: sorted-ascending global address ordinals for that cell. */
    ordinalsByCell: number[][];
}

export function buildCellIndex(entries: readonly CellEntry[], cellSizeDeg: number): CellIndex {
    const byCell = new Map<number, number[]>();
    for (const { lat, lon, ordinal } of entries) {
        const key = cellKeyOf(lat, lon, cellSizeDeg);
        let list = byCell.get(key);
        if (!list) {
            list = [];
            byCell.set(key, list);
        }
        list.push(ordinal);
    }

    const cellKeys = [...byCell.keys()].sort((a, b) => a - b);
    const ordinalsByCell = cellKeys.map((k) => byCell.get(k)!.sort((a, b) => a - b));
    return { cellKeys, ordinalsByCell };
}

export function encodeCellLists(ordinalsByCell: readonly number[][]): { blob: Buffer; byteLengths: number[] } {
    const bytes: number[] = [];
    const byteLengths: number[] = [];

    for (const ordinals of ordinalsByCell) {
        const start = bytes.length;
        let prev = 0;
        for (const ord of ordinals) {
            encodeVarint(ord - prev, bytes);
            prev = ord;
        }
        byteLengths.push(bytes.length - start);
    }

    return { blob: Buffer.from(bytes), byteLengths };
}

export function encodeCellDir(cellKeys: readonly number[], listByteLengths: readonly number[]): Buffer {
    const count = cellKeys.length;
    const keysArr = new Uint32Array(cellKeys);
    const listOffsets = new Uint32Array(count + 1);
    let cursor = 0;
    for (let i = 0; i < count; i++) {
        listOffsets[i] = cursor;
        cursor += listByteLengths[i]!;
    }
    listOffsets[count] = cursor;

    return Buffer.concat([
        Buffer.from(keysArr.buffer, keysArr.byteOffset, keysArr.byteLength),
        Buffer.from(listOffsets.buffer, listOffsets.byteOffset, listOffsets.byteLength),
    ]);
}

export function decodeCellDir(rawBuf: Buffer, count: number): { cellKeys: number[]; listOffsets: number[] } {
    const buf = ensureAligned(rawBuf);
    const keys = new Uint32Array(buf.buffer, buf.byteOffset, count);
    const offsets = new Uint32Array(buf.buffer, buf.byteOffset + count * 4, count + 1);
    return { cellKeys: [...keys], listOffsets: [...offsets] };
}

export function decodeCellList(blob: Buffer, start: number, end: number): number[] {
    const ordinals: number[] = [];
    let cursor = start;
    let prev = 0;
    while (cursor < end) {
        const [delta, consumed] = decodeVarint(blob, cursor);
        prev += delta;
        ordinals.push(prev);
        cursor += consumed;
    }
    return ordinals;
}
