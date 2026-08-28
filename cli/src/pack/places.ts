import type { NormalizedAddress } from "./types.ts";
import { StringInterner } from "./strings.ts";

/**
 * `places` is one shared string table for city/district and postcode values (PACK_FORMAT.md).
 * Id 0 is always the empty string, reserved as the "none" sentinel so a group with no postcode
 * (or, in principle, no place) can point at id 0 without a special case downstream.
 *
 * A group's "place" is `city`, falling back to `district` when city is blank — OpenAddresses'
 * `district` is rarely populated for US data and the plan's (street x place) hierarchy only
 * anticipates one place dimension, so this is a deliberate simplification, not a gap.
 */
export interface PlaceTable {
    values: string[];
    idOf: Map<string, number>;
}

export function placeNameFor(addr: NormalizedAddress): string {
    return addr.city || addr.district;
}

export function buildPlaceTable(addresses: readonly NormalizedAddress[]): PlaceTable {
    const interner = new StringInterner();
    interner.intern(""); // id 0 = none, always present

    for (const addr of addresses) {
        interner.intern(placeNameFor(addr));
        interner.intern(addr.postcode);
    }

    const values = interner.toArray();
    const idOf = new Map(values.map((v, i) => [v, i]));
    return { values, idOf };
}
