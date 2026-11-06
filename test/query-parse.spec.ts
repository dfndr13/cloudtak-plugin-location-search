import { describe, expect, it } from "vitest";
import { directionVariants, parseQuery, placeSplits } from "../lib/search/query-parse.ts";

describe("parseQuery", () => {
    it("extracts a leading house number", () => {
        expect(parseQuery("123 Main St")).toEqual({
            number: 123,
            streetQuery: "MAIN ST",
            placeHint: null,
            postcodeHint: null,
        });
    });

    it("canonicalizes directionals and suffixes the same way ingest does", () => {
        expect(parseQuery("123 North Main Street").streetQuery).toBe("N MAIN ST");
    });

    it("extracts a place hint after a comma", () => {
        const parsed = parseQuery("123 Main St, Mesa");
        expect(parsed.placeHint).toBe("Mesa");
        expect(parsed.streetQuery).toBe("MAIN ST");
    });

    it("extracts a trailing 5-digit postcode", () => {
        const parsed = parseQuery("123 Main St 85201");
        expect(parsed.postcodeHint).toBe("85201");
        expect(parsed.streetQuery).toBe("MAIN ST");
    });

    it("does not mistake the house number itself for a postcode", () => {
        // a 5-digit-only query like "85201" has nothing left over to be a street — the leading
        // number consumes it, so there's no trailing token to become a postcode hint.
        const parsed = parseQuery("85201");
        expect(parsed.number).toBe(85201);
        expect(parsed.postcodeHint).toBeNull();
        expect(parsed.streetQuery).toBe("");
    });

    it("handles a street-only query with no number", () => {
        const parsed = parseQuery("Main St");
        expect(parsed.number).toBeNull();
        expect(parsed.streetQuery).toBe("MAIN ST");
    });

    it("returns empty streetQuery for a blank query", () => {
        expect(parseQuery("   ").streetQuery).toBe("");
    });
});

describe("placeSplits", () => {
    it("reads trailing words as the place, fewest first", () => {
        const splits = placeSplits(parseQuery("123 Main St Mesa Az"));
        expect(splits.map((s) => [s.streetQuery, s.placeHint])).toEqual([
            ["MAIN ST MESA", "Az"],
            ["MAIN ST", "Mesa Az"],
            ["MAIN", "St Mesa Az"],
        ]);
        expect(splits[0]!.number).toBe(123);
    });

    it("offers nothing when the query already names a place, or has one street word", () => {
        expect(placeSplits(parseQuery("123 Main St, Mesa"))).toEqual([]);
        expect(placeSplits(parseQuery("Main"))).toEqual([]);
    });
});

describe("directionVariants", () => {
    it("puts each direction in front of the street and keeps the rest of the query", () => {
        const variants = directionVariants(parseQuery("100 10th St, Salina"));
        expect(variants.map((v) => v.streetQuery)).toEqual([
            "N 10TH ST", "S 10TH ST", "E 10TH ST", "W 10TH ST", "NE 10TH ST", "NW 10TH ST", "SE 10TH ST", "SW 10TH ST",
        ]);
        expect(variants[0]!.number).toBe(100);
        expect(variants[0]!.placeHint).toBe("Salina");
    });

    it("offers nothing when the street already has a direction, or there is no street", () => {
        expect(directionVariants(parseQuery("N 10th St"))).toEqual([]);
        expect(directionVariants(parseQuery("North 10th St"))).toEqual([]);
        expect(directionVariants(parseQuery("SW 10th Ave"))).toEqual([]);
        expect(directionVariants(parseQuery("12345"))).toEqual([]);
    });
});
