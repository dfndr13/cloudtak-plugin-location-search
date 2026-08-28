import { describe, expect, it } from "vitest";
import { prefixRange, streetIdsInRange } from "../lib/search/prefix-search.ts";

const STREETS = ["E MAIN ST", "MAIN ST", "N MAIN ST", "N OAK AVE", "S OAK AVE"];

describe("prefixRange", () => {
    it("finds the contiguous range of streets starting with a prefix", () => {
        const range = prefixRange(STREETS, "N ");
        expect(streetIdsInRange(range).map((id) => STREETS[id])).toEqual(["N MAIN ST", "N OAK AVE"]);
    });

    it("matches a single exact street", () => {
        const range = prefixRange(STREETS, "MAIN ST");
        expect(streetIdsInRange(range).map((id) => STREETS[id])).toEqual(["MAIN ST"]);
    });

    it("returns an empty range for no match", () => {
        const range = prefixRange(STREETS, "ZZZ");
        expect(streetIdsInRange(range)).toEqual([]);
    });

    it("returns everything for an empty prefix", () => {
        const range = prefixRange(STREETS, "");
        expect(streetIdsInRange(range)).toHaveLength(STREETS.length);
    });
});
