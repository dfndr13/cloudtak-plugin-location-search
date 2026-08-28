import { describe, expect, it } from "vitest";
import {
    normalizeStreetForMatch,
    normalizeStreetForDisplay,
    splitHouseNumber,
    normalizeFeature,
    dedupeKey,
} from "../src/ingest/normalize.ts";
import type { RawOAFeature } from "../src/ingest/openaddresses.ts";

describe("normalizeStreetForMatch", () => {
    it("collapses suffix variants to the same match key", () => {
        expect(normalizeStreetForMatch("Main Street")).toBe(normalizeStreetForMatch("Main St"));
        expect(normalizeStreetForMatch("N Main St")).toBe(normalizeStreetForMatch("North Main Street"));
    });

    it("collapses directional variants to the same match key", () => {
        expect(normalizeStreetForMatch("S Oak Avenue")).toBe(normalizeStreetForMatch("South Oak Ave"));
    });

    it("uppercases and strips punctuation", () => {
        expect(normalizeStreetForMatch("o'malley st.")).toBe("O MALLEY ST");
    });

    it("returns empty string for blank input", () => {
        expect(normalizeStreetForMatch("")).toBe("");
        expect(normalizeStreetForMatch("   ")).toBe("");
    });
});

describe("normalizeStreetForDisplay", () => {
    it("title-cases while keeping short tokens (directionals/suffixes) upper", () => {
        expect(normalizeStreetForDisplay("north main street")).toBe("N Main St");
    });
});

describe("splitHouseNumber", () => {
    it("splits a plain numeric number", () => {
        expect(splitHouseNumber("123")).toEqual({ number: 123, extra: "" });
    });

    it("splits an alphanumeric number", () => {
        expect(splitHouseNumber("123A")).toEqual({ number: 123, extra: "A" });
    });

    it("returns null for a non-numeric-leading string", () => {
        expect(splitHouseNumber("ABC")).toBeNull();
        expect(splitHouseNumber("")).toBeNull();
    });
});

function feature(overrides: Partial<RawOAFeature>): RawOAFeature {
    return {
        number: "123",
        street: "Main St",
        unit: "",
        city: "Mesa",
        district: "",
        region: "AZ",
        postcode: "85201",
        hash: "h",
        lon: -111.8,
        lat: 33.4,
        ...overrides,
    };
}

describe("normalizeFeature", () => {
    it("drops features with no street", () => {
        expect(normalizeFeature(feature({ street: "" }))).toBeNull();
    });

    it("drops features with no number", () => {
        expect(normalizeFeature(feature({ number: "" }))).toBeNull();
    });

    it("normalizes a well-formed feature", () => {
        const result = normalizeFeature(feature({}));
        expect(result).not.toBeNull();
        expect(result!.streetMatch).toBe("MAIN ST");
        expect(result!.number).toBe(123);
        expect(result!.numberExtra).toBe("");
    });
});

describe("dedupeKey", () => {
    it("is stable across differing display casing", () => {
        const a = normalizeFeature(feature({ street: "Main Street" }))!;
        const b = normalizeFeature(feature({ street: "MAIN ST" }))!;
        expect(dedupeKey(a)).toBe(dedupeKey(b));
    });

    it("differs when unit differs", () => {
        const a = normalizeFeature(feature({ unit: "1" }))!;
        const b = normalizeFeature(feature({ unit: "2" }))!;
        expect(dedupeKey(a)).not.toBe(dedupeKey(b));
    });
});
