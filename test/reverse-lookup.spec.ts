import { describe, expect, it } from "vitest";
import {
    buildChunkFirstOrdinals,
    buildGroupsByChunk,
    candidateOrdinals,
    chunkForOrdinal,
    findCellSlot,
    groupForRowOffset,
    type DecodedCellDir,
} from "../lib/search/reverse-lookup.ts";
import { cellKeyOf } from "../lib/pack/cells.ts";
// The portable lib/pack/varint.ts reader has no encoder (search-time code never writes varints) —
// this test needs one to build a fake cellLists blob, so it reuses the CLI's writer-side encoder,
// same as test/search-index.spec.ts already imports cli/src/pack/build.ts for the same reason.
import { encodeVarint } from "../cli/src/pack/varint.ts";
import type { DecodedGroup, PackManifest, PackSectionMeta } from "../lib/pack/types.ts";

function section(id: string, count?: number): PackSectionMeta {
    return { id, kind: "test", byteOffset: 0, byteLength: 0, compressed: false, checksum: "", count };
}

function manifestWithChunkCounts(counts: number[]): PackManifest {
    return {
        version: 1,
        createdAt: "",
        region: "TEST",
        addressCount: counts.reduce((a, b) => a + b, 0),
        cellSizeDeg: 0.005,
        sections: counts.map((count, i) => section(`chunk:${i}`, count)),
    };
}

function group(overrides: Partial<DecodedGroup>): DecodedGroup {
    return {
        streetId: 0,
        placeId: 0,
        postcodeId: 0,
        centroidLatE7: 0,
        centroidLonE7: 0,
        chunkId: 0,
        rowOffset: 0,
        rowCount: 0,
        ...overrides,
    };
}

describe("buildChunkFirstOrdinals / chunkForOrdinal", () => {
    it("computes a prefix sum over chunk section counts, in chunk-index order", () => {
        const manifest = manifestWithChunkCounts([10, 5, 20]);
        expect(buildChunkFirstOrdinals(manifest)).toEqual([0, 10, 15]);
    });

    it("ignores non-chunk sections when building the prefix sum", () => {
        const manifest = manifestWithChunkCounts([10, 5]);
        manifest.sections.push(section("groups", 999), section("streets", 999));
        expect(buildChunkFirstOrdinals(manifest)).toEqual([0, 10]);
    });

    it("resolves an ordinal to the chunk that owns it, including boundary ordinals", () => {
        const firstOrdinals = [0, 10, 15]; // chunk 0: [0,10), chunk 1: [10,15), chunk 2: [15,...)
        expect(chunkForOrdinal(firstOrdinals, 0)).toBe(0);
        expect(chunkForOrdinal(firstOrdinals, 9)).toBe(0);
        expect(chunkForOrdinal(firstOrdinals, 10)).toBe(1);
        expect(chunkForOrdinal(firstOrdinals, 14)).toBe(1);
        expect(chunkForOrdinal(firstOrdinals, 15)).toBe(2);
        expect(chunkForOrdinal(firstOrdinals, 1000)).toBe(2);
    });
});

describe("buildGroupsByChunk / groupForRowOffset", () => {
    it("buckets groups by chunkId and finds the owning group by row offset", () => {
        const groups = [
            group({ chunkId: 0, rowOffset: 0, rowCount: 5 }),
            group({ chunkId: 0, rowOffset: 5, rowCount: 3 }),
            group({ chunkId: 1, rowOffset: 0, rowCount: 10 }),
        ];
        const byChunk = buildGroupsByChunk(groups);

        expect(groupForRowOffset(byChunk.get(0)!, 0)).toBe(groups[0]);
        expect(groupForRowOffset(byChunk.get(0)!, 4)).toBe(groups[0]);
        expect(groupForRowOffset(byChunk.get(0)!, 5)).toBe(groups[1]);
        expect(groupForRowOffset(byChunk.get(0)!, 7)).toBe(groups[1]);
        expect(groupForRowOffset(byChunk.get(1)!, 9)).toBe(groups[2]);
    });

    it("sorts groups by rowOffset even if given out of order", () => {
        const groups = [
            group({ chunkId: 0, rowOffset: 5, rowCount: 2 }),
            group({ chunkId: 0, rowOffset: 0, rowCount: 5 }),
        ];
        const byChunk = buildGroupsByChunk(groups);
        expect(groupForRowOffset(byChunk.get(0)!, 6)!.rowOffset).toBe(5);
    });

    it("returns undefined for a row offset no group covers", () => {
        const groups = [group({ chunkId: 0, rowOffset: 0, rowCount: 5 })];
        const byChunk = buildGroupsByChunk(groups);
        expect(groupForRowOffset(byChunk.get(0)!, 5)).toBeUndefined();
    });
});

describe("findCellSlot", () => {
    const cellDir: DecodedCellDir = { cellKeys: [10, 20, 30], listOffsets: [0, 4, 9, 12] };

    it("finds an exact key match", () => {
        expect(findCellSlot(cellDir, 20)).toBe(1);
    });

    it("returns undefined for an unoccupied cell", () => {
        expect(findCellSlot(cellDir, 15)).toBeUndefined();
    });
});

describe("candidateOrdinals — the radius-widening search", () => {
    const cellSizeDeg = 0.005;
    const lat = 33.4;
    const lon = -111.9;

    function encodeCellLists(ordinalsByCellKey: Map<number, number[]>): { cellDir: DecodedCellDir; blob: Uint8Array } {
        const sortedKeys = [...ordinalsByCellKey.keys()].sort((a, b) => a - b);
        const bytes: number[] = [];
        const listOffsets = [0];
        for (const key of sortedKeys) {
            let prev = 0;
            for (const ordinal of ordinalsByCellKey.get(key)!.sort((a, b) => a - b)) {
                encodeVarint(ordinal - prev, bytes);
                prev = ordinal;
            }
            listOffsets.push(bytes.length);
        }
        return { cellDir: { cellKeys: sortedKeys, listOffsets }, blob: Uint8Array.from(bytes) };
    }

    it("finds candidates in the immediate 9-cell radius without widening", () => {
        const centerKey = cellKeyOf(lat, lon, cellSizeDeg);
        const { cellDir, blob } = encodeCellLists(new Map([[centerKey, [42]]]));
        expect(candidateOrdinals(lat, lon, cellSizeDeg, cellDir, blob)).toEqual([42]);
    });

    it("widens the search radius when the immediate neighbourhood is empty", () => {
        // 4 cells away in latitude — outside radius 1, inside radius 4.
        const farKey = cellKeyOf(lat + 4 * cellSizeDeg, lon, cellSizeDeg);
        const { cellDir, blob } = encodeCellLists(new Map([[farKey, [7]]]));
        expect(candidateOrdinals(lat, lon, cellSizeDeg, cellDir, blob)).toEqual([7]);
    });

    it("gives up and returns an empty list when nothing is within the max radius", () => {
        const { cellDir, blob } = encodeCellLists(new Map());
        expect(candidateOrdinals(lat, lon, cellSizeDeg, cellDir, blob)).toEqual([]);
    });
});
