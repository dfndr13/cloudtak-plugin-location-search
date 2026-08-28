import { describe, expect, it } from "vitest";
import { buildTrigramPostings, encodeTrigramPostings, decodeTrigramPostings, trigramsOf } from "../src/pack/trigrams.ts";

describe("trigramsOf", () => {
    it("pads boundaries so edge trigrams are indexed", () => {
        const trigrams = trigramsOf("N MAIN ST");
        // "#N " should be present (leading boundary) and "T#" ... " ST#" -> "ST#" trailing boundary.
        const padded = `#N MAIN ST#`;
        expect(trigrams).toHaveLength(padded.length - 2);
    });
});

describe("trigram postings round-trip", () => {
    it("recovers the same postings after encode/decode", () => {
        const streets = ["N MAIN ST", "S MAIN ST", "S OAK AVE"];
        const postings = buildTrigramPostings(streets);
        const decoded = decodeTrigramPostings(encodeTrigramPostings(postings));
        expect(decoded).toEqual(postings);
    });

    it("shares trigrams between similar street names", () => {
        const streets = ["N MAIN ST", "S MAIN ST", "S OAK AVE"];
        const postings = buildTrigramPostings(streets);
        const mainIdx = postings.trigramKeys.findIndex((_, i) => {
            const posting = postings.postingsByTrigram[i]!;
            return posting.includes(0) && posting.includes(1); // both MAIN ST streets
        });
        expect(mainIdx).toBeGreaterThanOrEqual(0);
    });
});
