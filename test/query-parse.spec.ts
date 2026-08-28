import { describe, expect, it } from "vitest";
import { parseQuery } from "../lib/search/query-parse.ts";

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
