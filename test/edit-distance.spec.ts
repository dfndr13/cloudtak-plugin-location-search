import { describe, expect, it } from "vitest";
import { damerauLevenshtein, editDistanceBoundFor } from "../lib/search/edit-distance.ts";

describe("damerauLevenshtein", () => {
    it("is 0 for identical strings", () => {
        expect(damerauLevenshtein("MAIN ST", "MAIN ST", 2)).toBe(0);
    });

    it("counts a single substitution as 1", () => {
        expect(damerauLevenshtein("MAIN ST", "MASN ST", 2)).toBe(1);
    });

    it("counts an adjacent transposition as 1, not 2", () => {
        expect(damerauLevenshtein("MIAN", "MAIN", 2)).toBe(1);
    });

    it("counts a single insertion/deletion as 1", () => {
        expect(damerauLevenshtein("MAIN", "MAINE", 2)).toBe(1);
        expect(damerauLevenshtein("MAINE", "MAIN", 2)).toBe(1);
    });

    it("clamps anything beyond maxDistance to maxDistance + 1", () => {
        expect(damerauLevenshtein("MAIN ST", "COMPLETELY DIFFERENT", 2)).toBe(3);
    });

    it("short-circuits on length difference alone", () => {
        expect(damerauLevenshtein("A", "ABCDEFGH", 2)).toBe(3);
    });
});

describe("editDistanceBoundFor", () => {
    it("is 1 under 6 chars, 2 at 6 or more (PLAN.md §4.1 step 3)", () => {
        expect(editDistanceBoundFor(5)).toBe(1);
        expect(editDistanceBoundFor(6)).toBe(2);
        expect(editDistanceBoundFor(20)).toBe(2);
    });
});
