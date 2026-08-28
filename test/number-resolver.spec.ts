import { describe, expect, it } from "vitest";
import { resolveNumber, collectUnitSiblings } from "../lib/search/number-resolver.ts";
import type { DecodedChunkRow } from "../lib/pack/types.ts";

function row(number: number, unitRef = 0): DecodedChunkRow {
    return { number, latD: 0, lonD: 0, unitRef, numExtra: 0 };
}

describe("resolveNumber", () => {
    const rows: DecodedChunkRow[] = [row(100), row(102), row(104), row(106), row(108)];
    const group = { rowOffset: 0, rowCount: rows.length };

    it("finds an exact match", () => {
        const resolved = resolveNumber(rows, group, 104);
        expect(resolved).toEqual({ row: rows[2], rowIndex: 2, matchedVia: "exact" });
    });

    it("falls back to the nearest existing number on a miss", () => {
        const resolved = resolveNumber(rows, group, 105);
        expect(resolved!.matchedVia).toBe("nearest");
        expect([104, 106]).toContain(resolved!.row.number);
    });

    it("clamps to the boundary when the target is below the group's range", () => {
        const resolved = resolveNumber(rows, group, 1);
        expect(resolved!.row.number).toBe(100);
        expect(resolved!.matchedVia).toBe("nearest");
    });

    it("clamps to the boundary when the target is above the group's range", () => {
        const resolved = resolveNumber(rows, group, 999);
        expect(resolved!.row.number).toBe(108);
    });

    it("returns the first row when the query had no number at all", () => {
        const resolved = resolveNumber(rows, group, null);
        expect(resolved!.row.number).toBe(100);
        expect(resolved!.matchedVia).toBe("nearest");
    });

    it("returns null for an empty group", () => {
        expect(resolveNumber(rows, { rowOffset: 0, rowCount: 0 }, 100)).toBeNull();
    });

    it("only searches within the given group's row range", () => {
        // rows[0..1] belong to a different, preceding group in the same chunk.
        const multiGroupRows = [row(1), row(2), row(100), row(102)];
        const resolved = resolveNumber(multiGroupRows, { rowOffset: 2, rowCount: 2 }, 100);
        expect(resolved!.rowIndex).toBe(2);
    });
});

describe("collectUnitSiblings", () => {
    it("collapses multiple units at the same number into one representative + a unit list", () => {
        const rows: DecodedChunkRow[] = [row(198), row(200, 1), row(200, 2), row(200, 0), row(202)];
        const group = { rowOffset: 0, rowCount: rows.length };
        const resolved = resolveNumber(rows, group, 200)!;
        const units = ["", "Unit 1", "Unit 2"];

        const { representative, unitList } = collectUnitSiblings(rows, group, resolved, units);
        expect(representative.number).toBe(200);
        expect(representative.unitRef).toBe(0); // prefers the no-unit row as representative
        expect(unitList.sort()).toEqual(["Unit 1", "Unit 2"]);
    });

    it("returns an empty unit list when there are no siblings", () => {
        const rows: DecodedChunkRow[] = [row(100), row(102)];
        const group = { rowOffset: 0, rowCount: rows.length };
        const resolved = resolveNumber(rows, group, 100)!;
        const { unitList } = collectUnitSiblings(rows, group, resolved, [""]);
        expect(unitList).toEqual([]);
    });
});
