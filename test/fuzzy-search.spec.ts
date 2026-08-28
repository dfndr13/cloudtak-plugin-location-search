import { describe, expect, it } from "vitest";
import { buildTrigramPostings, encodeTrigramPostings } from "../cli/src/pack/trigrams.ts";
import { decodeTrigramPostings } from "../lib/pack/trigrams.ts";
import { trigramCandidateStreetIds, verifyFuzzyCandidates } from "../lib/search/fuzzy-search.ts";

const STREETS = ["N MAIN ST", "S MAIN ST", "S OAK AVE", "E CROCUS DR"];
// `new Uint8Array(buffer)` (constructor-copy) rather than a `.buffer`/`.byteOffset` view: Node
// pools small Buffer allocations, so a view over the pooled buffer isn't guaranteed 4-byte
// aligned, which the DataView-based portable decoder requires.
const trigrams = decodeTrigramPostings(new Uint8Array(encodeTrigramPostings(buildTrigramPostings(STREETS))));

describe("trigramCandidateStreetIds + verifyFuzzyCandidates", () => {
    it("resolves a typo'd street to the correct real street", () => {
        // "MIAN ST" is a transposition typo of "MAIN ST".
        const candidates = trigramCandidateStreetIds("N MIAN ST", trigrams);
        expect(candidates).toContain(0); // N MAIN ST

        const verified = verifyFuzzyCandidates("N MIAN ST", candidates, STREETS);
        expect(verified[0]!.streetId).toBe(0);
        expect(verified[0]!.distance).toBe(1);
    });

    it("does not verify a candidate that's genuinely a different street", () => {
        const candidates = trigramCandidateStreetIds("E CROCUS DR", trigrams);
        const verified = verifyFuzzyCandidates("E CROCUS DR", candidates, STREETS);
        expect(verified.map((m) => m.streetId)).toEqual([3]);
    });

    it("filters out candidates whose edit distance exceeds the bound", () => {
        const verified = verifyFuzzyCandidates("XYZXYZXYZ", [0, 1, 2, 3], STREETS);
        expect(verified).toEqual([]);
    });
});
