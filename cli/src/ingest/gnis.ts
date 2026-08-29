/**
 * Ingest adapter for the USGS GNIS "National File" export: `|`-delimited text with a header row.
 * Mirrors `ingest/openaddresses.ts`'s role — parse + normalize a raw source format into one
 * generic intermediate (`NormalizedGazetteerRecord`, `pack/types.ts`) that `pack/gazetteer.ts`
 * never has to know the origin of. Future gazetteer sources ("and other sources" per the user's
 * own framing) are additional files here producing that same shape.
 *
 * USGS has adjusted the National File's exact column names across releases (most notably
 * PRIMARY_LAT_DEC/PRIMARY_LONG_DEC -> PRIM_LAT_DEC/PRIM_LONG_DEC at some point). Columns are
 * resolved by name from the file's own header row, trying each known alias in turn, rather than
 * assumed by fixed position or a single hardcoded name — a file missing every alias for a
 * required column fails loudly and names exactly what it was looking for, instead of silently
 * misreading a shifted column.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { normalizePlace, normalizeGazetteerNameForMatch, normalizeGazetteerNameForDisplay } from "../../../lib/normalize.ts";
import type { NormalizedGazetteerRecord } from "../pack/types.ts";

const FIELD_ALIASES: Record<"name" | "featureClass" | "state" | "county" | "lat" | "lon", string[]> = {
    name: ["FEATURE_NAME"],
    featureClass: ["FEATURE_CLASS"],
    // STATE_ALPHA (2-letter code) is the older National File convention; current GNIS "Domestic
    // Names" text exports (confirmed against a real 2026 AZ download) use STATE_NAME (full name,
    // e.g. "Arizona") instead and don't carry a 2-letter column at all.
    state: ["STATE_ALPHA", "STATE_NAME"],
    county: ["COUNTY_NAME"],
    lat: ["PRIM_LAT_DEC", "PRIMARY_LAT_DEC"],
    lon: ["PRIM_LONG_DEC", "PRIMARY_LONG_DEC"],
};

type ColumnIndex = Record<keyof typeof FIELD_ALIASES, number>;

/**
 * Feature classes worth surfacing for field/SAR use — terrain, hydrography, populated places, and
 * common infrastructure. GNIS carries many classes (e.g. individual survey monuments) that would
 * mostly add noise to search results; `--classes all` on the CLI bypasses this allowlist entirely,
 * and `--classes <comma-list>` replaces it. Stored uppercased since class comparison is
 * case-insensitive against whatever casing the source file actually uses.
 */
export const DEFAULT_GAZETTEER_CLASSES = new Set(
    [
        "Summit", "Ridge", "Valley", "Gap", "Range",
        "Stream", "Lake", "Reservoir", "Falls", "Spring", "Bay",
        "Populated Place", "Locale",
        "Airport", "Bridge", "Dam", "Church", "School", "Hospital", "Cemetery", "Tower", "Mine", "Park",
    ].map((c) => c.toUpperCase()),
);

export type ParsedGnisLine =
    | { ok: true; record: NormalizedGazetteerRecord }
    | { ok: false; reason: "blank-name" | "blank-class" | "invalid-coordinates" | "filtered-class" };

export interface ParseGnisOptions {
    /** Feature classes to keep (matched case-insensitively), or `"all"` to skip filtering
     *  entirely. Defaults to `DEFAULT_GAZETTEER_CLASSES`. */
    classes?: Set<string> | "all";
}

function resolveColumns(headerLine: string): ColumnIndex {
    const headers = headerLine.split("|").map((h) => h.trim().toUpperCase());
    const indexOf = new Map(headers.map((h, i) => [h, i]));
    const result = {} as ColumnIndex;
    for (const [logical, aliases] of Object.entries(FIELD_ALIASES) as [keyof typeof FIELD_ALIASES, string[]][]) {
        const found = aliases.find((alias) => indexOf.has(alias));
        if (found === undefined) {
            throw new Error(
                `GNIS file is missing a required column for "${logical}" (tried: ${aliases.join(", ")}); ` +
                    `header row had: ${headers.join(", ")}`,
            );
        }
        result[logical] = indexOf.get(found)!;
    }
    return result;
}

/**
 * Streams one GNIS National File export, yielding one `ParsedGnisLine` per data row (the header
 * row is consumed to resolve columns, never yielded). Never silently drops a row without a
 * reason — same convention as `ingest/openaddresses.ts`'s `ParsedLine`.
 */
export async function* parseGnisFile(filePath: string, opts: ParseGnisOptions = {}): AsyncGenerator<ParsedGnisLine> {
    const classFilter = opts.classes ?? DEFAULT_GAZETTEER_CLASSES;
    const rl = createInterface({
        input: createReadStream(filePath, { encoding: "utf8" }),
        crlfDelay: Number.POSITIVE_INFINITY,
    });

    let columns: ColumnIndex | undefined;

    for await (const line of rl) {
        if (!columns) {
            columns = resolveColumns(line);
            continue;
        }

        const trimmed = line.trim();
        if (!trimmed) continue;

        const cols = trimmed.split("|");
        const rawName = (cols[columns.name] ?? "").trim();
        const rawClass = (cols[columns.featureClass] ?? "").trim();
        const rawCounty = (cols[columns.county] ?? "").trim();
        const rawState = (cols[columns.state] ?? "").trim();
        const rawLat = Number.parseFloat(cols[columns.lat] ?? "");
        const rawLon = Number.parseFloat(cols[columns.lon] ?? "");

        if (!rawName) {
            yield { ok: false, reason: "blank-name" };
            continue;
        }
        if (!rawClass) {
            yield { ok: false, reason: "blank-class" };
            continue;
        }
        if (!Number.isFinite(rawLat) || !Number.isFinite(rawLon) || (rawLat === 0 && rawLon === 0)) {
            yield { ok: false, reason: "invalid-coordinates" };
            continue;
        }
        if (classFilter !== "all" && !classFilter.has(rawClass.toUpperCase())) {
            yield { ok: false, reason: "filtered-class" };
            continue;
        }

        yield {
            ok: true,
            record: {
                nameMatch: normalizeGazetteerNameForMatch(rawName),
                nameDisplay: normalizeGazetteerNameForDisplay(rawName),
                featureClass: rawClass,
                county: normalizePlace(rawCounty),
                // Preserved as-is rather than forced to a case: STATE_ALPHA sources already give
                // "AZ" uppercase, STATE_NAME sources give "Arizona" properly cased — either is
                // fine to display/filter on, and forcing one case would mangle the other.
                state: rawState,
                lat: rawLat,
                lon: rawLon,
            },
        };
    }
}

/** Streams every GNIS file in `filePaths`, in order, as one logical line stream. */
export async function* parseGnisFiles(filePaths: readonly string[], opts: ParseGnisOptions = {}): AsyncGenerator<ParsedGnisLine> {
    for (const filePath of filePaths) {
        yield* parseGnisFile(filePath, opts);
    }
}

/**
 * Dedup key: (name match-form, feature class, county, state, coordinates rounded to 4 decimal
 * degrees ~ 11m). The coordinate component is required, not incidental: a real 29,777-row AZ GNIS
 * export has, e.g., nine distinct "Government Spring"s in Yavapai County alone, tens of km apart —
 * a location-blind key of (name, class, county, state) alone would silently collapse all of them
 * into one, discarding real, distinct features. Rounding (rather than requiring exact equality)
 * still catches genuine reprint duplicates across periodic file updates, whose coordinates can
 * shift by a fraction of an arcsecond between GNIS revisions.
 */
export function dedupeGazetteerKey(record: NormalizedGazetteerRecord): string {
    const latR = record.lat.toFixed(4);
    const lonR = record.lon.toFixed(4);
    return `${record.nameMatch}|${record.featureClass.toUpperCase()}|${record.county}|${record.state}|${latR}|${lonR}`;
}
