import { describe, expect, it } from "vitest";
import {
    cellKeyOf,
    neighbourCellKeys,
    buildCellIndex,
    encodeCellDir,
    encodeCellLists,
    decodeCellDir,
    decodeCellList,
    lonSteps,
} from "../src/pack/cells.ts";

const CELL_SIZE = 0.005;

describe("cellKeyOf", () => {
    it("fits in an unsigned 32-bit integer across the full lat/lon range", () => {
        const maxKey = cellKeyOf(89.999, 179.999, CELL_SIZE);
        expect(maxKey).toBeLessThan(2 ** 32);
        expect(maxKey).toBeGreaterThanOrEqual(0);
    });

    it("is stable for points in the same cell", () => {
        // Deliberately mid-cell, not on a 0.005 grid line — see the boundary test below for that case.
        const a = cellKeyOf(33.4162, -111.8462, CELL_SIZE);
        const b = cellKeyOf(33.4163, -111.8463, CELL_SIZE);
        expect(a).toBe(b);
    });

    it("places a point exactly on a grid line deterministically (float-rounding guard)", () => {
        // (33.415 + 90) / 0.005 is mathematically exactly 24683, but binary floating point
        // represents it as 24682.999999999996 without the epsilon guard in latIdxOf/lonIdxOf.
        const onGridLine = cellKeyOf(33.415, -111.845, CELL_SIZE);
        const justInsideNextCell = cellKeyOf(33.4151, -111.8449, CELL_SIZE);
        expect(onGridLine).toBe(justInsideNextCell);
    });

    it("differs across a cell boundary", () => {
        const a = cellKeyOf(33.4150, -111.8450, CELL_SIZE);
        const b = cellKeyOf(33.4150 + CELL_SIZE * 2, -111.8450, CELL_SIZE);
        expect(a).not.toBe(b);
    });
});

describe("neighbourCellKeys", () => {
    it("returns 9 keys including self, matching manual index math", () => {
        const lat = 33.415;
        const lon = -111.845;
        const keys = neighbourCellKeys(lat, lon, CELL_SIZE);
        expect(keys).toHaveLength(9);
        expect(new Set(keys).size).toBe(9);
        expect(keys).toContain(cellKeyOf(lat, lon, CELL_SIZE));

        const steps = lonSteps(CELL_SIZE);
        const self = cellKeyOf(lat, lon, CELL_SIZE);
        expect(keys).toContain(self + 1);
        expect(keys).toContain(self - 1);
        expect(keys).toContain(self + steps);
        expect(keys).toContain(self - steps);
    });
});

describe("cell index round-trip", () => {
    it("recovers per-cell ordinal lists after encode/decode", () => {
        const entries = [
            { lat: 33.4150, lon: -111.8450, ordinal: 5 },
            { lat: 33.4151, lon: -111.8451, ordinal: 2 },
            { lat: 33.4151, lon: -111.8451, ordinal: 100 },
            { lat: 33.5000, lon: -111.9000, ordinal: 7 },
        ];
        const index = buildCellIndex(entries, CELL_SIZE);
        const { blob, byteLengths } = encodeCellLists(index.ordinalsByCell);
        const dirBuf = encodeCellDir(index.cellKeys, byteLengths);

        const { cellKeys, listOffsets } = decodeCellDir(dirBuf, index.cellKeys.length);
        expect(cellKeys).toEqual(index.cellKeys);

        for (let i = 0; i < cellKeys.length; i++) {
            const decoded = decodeCellList(blob, listOffsets[i]!, listOffsets[i + 1]!);
            expect(decoded).toEqual(index.ordinalsByCell[i]);
        }
    });
});
