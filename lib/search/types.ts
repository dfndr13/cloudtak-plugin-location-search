export interface GeoPoint {
    lat: number;
    lon: number;
}

export interface SearchOptions {
    /** GPS fix, or map-center fallback, for distance ranking (PLAN.md §4.1 step 4 / decision #11). */
    reference?: GeoPoint;
    limit?: number;
}

export type MatchKind = "exact" | "prefix" | "fuzzy";
export type NumberMatchKind = "exact" | "nearest";

export interface SearchResult {
    displayAddress: string;
    lat: number;
    lon: number;
    number: number;
    numberExtra: string;
    streetDisplay: string;
    city: string;
    postcode: string;
    /** Sibling unit strings at this base address (PLAN.md §3.3/decision #12 — units collapse to the base address). */
    units: string[];
    matchedVia: MatchKind;
    numberMatchedVia: NumberMatchKind;
    /** Higher is better. Internal ranking score, not meant for display. */
    score: number;
    distanceMeters: number | null;
}

export interface ParsedQuery {
    number: number | null;
    /** Canonicalized street tokens joined by spaces — may be a partial/prefix. */
    streetQuery: string;
    placeHint: string | null;
    postcodeHint: string | null;
}
