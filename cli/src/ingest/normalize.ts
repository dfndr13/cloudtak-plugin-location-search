/**
 * PLAN.md §3.2 normalization glue for OpenAddresses features. The actual street/place
 * canonicalization tables live in `lib/normalize.ts`, shared with the search-time query parser
 * (`lib/search/query-parse.ts`) so ingest-time and search-time normalization can never drift.
 */
import {
    normalizeStreetForMatch,
    normalizeStreetForDisplay,
    normalizePlace,
    normalizePostcode,
    splitHouseNumber,
} from "../../../lib/normalize.ts";
import type { RawOAFeature } from "./openaddresses.ts";
import type { NormalizedAddress } from "../pack/types.ts";

export {
    basicNormalize,
    normalizeStreetForMatch,
    normalizeStreetForDisplay,
    normalizePlace,
    normalizePostcode,
    splitHouseNumber,
} from "../../../lib/normalize.ts";

/**
 * Applies PLAN.md §3.2: drop features with no geometry (checked by the caller/parser already) or
 * no number+street; canonicalize street/place forms; split alphanumeric house numbers.
 */
export function normalizeFeature(raw: RawOAFeature): NormalizedAddress | null {
    const streetMatch = normalizeStreetForMatch(raw.street);
    if (!streetMatch || !raw.number.trim()) return null;

    const split = splitHouseNumber(raw.number);
    if (!split) return null;

    return {
        streetMatch,
        streetDisplay: normalizeStreetForDisplay(raw.street),
        number: split.number,
        numberExtra: split.extra,
        unit: raw.unit.trim(),
        city: normalizePlace(raw.city),
        district: normalizePlace(raw.district),
        region: normalizePlace(raw.region),
        postcode: normalizePostcode(raw.postcode),
        lat: raw.lat,
        lon: raw.lon,
    };
}

/** Dedup key per PLAN.md §3.2: (street, number, unit, city). */
export function dedupeKey(addr: NormalizedAddress): string {
    return `${addr.streetMatch} ${addr.number} ${addr.numberExtra} ${addr.unit.toUpperCase()} ${addr.city}`;
}
