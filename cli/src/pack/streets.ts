import type { NormalizedAddress } from "./types.ts";

export interface StreetTable {
    /** Sorted street match-forms; array index IS the streetId. */
    matchForms: string[];
    /** Parallel array: display form for each streetId (first-seen casing). */
    displayForms: string[];
    streetIdOf: Map<string, number>;
}

export function buildStreetTable(addresses: readonly NormalizedAddress[]): StreetTable {
    const displayByMatch = new Map<string, string>();
    for (const addr of addresses) {
        if (!displayByMatch.has(addr.streetMatch)) {
            displayByMatch.set(addr.streetMatch, addr.streetDisplay);
        }
    }

    const matchForms = [...displayByMatch.keys()].sort();
    const displayForms = matchForms.map((m) => displayByMatch.get(m)!);
    const streetIdOf = new Map(matchForms.map((m, i) => [m, i]));

    return { matchForms, displayForms, streetIdOf };
}
