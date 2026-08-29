export interface NormalizedAddress {
    /** Match-form tokens, e.g. ["N", "MAIN", "ST"] — canonicalized, uppercase, no punctuation. */
    streetMatch: string;
    /** Display form, e.g. "N Main St" — human-facing casing preserved. */
    streetDisplay: string;
    number: number;
    /** Non-numeric remainder of an alphanumeric house number, e.g. "A" in "123A". Empty = none. */
    numberExtra: string;
    unit: string;
    city: string;
    district: string;
    region: string;
    postcode: string;
    lat: number;
    lon: number;
}

export interface PackSectionMeta {
    id: string;
    kind: string;
    byteOffset: number;
    byteLength: number;
    compressed: boolean;
    checksum: string;
    count?: number;
}

export interface PackManifest {
    version: number;
    createdAt: string;
    region: string;
    addressCount: number;
    cellSizeDeg: number;
    sections: PackSectionMeta[];
}

export const PACK_MAGIC = "CTAS";
export const PACK_VERSION = 1;
export const DEFAULT_CELL_SIZE_DEG = 0.005;

/**
 * A named place record from a gazetteer source (USGS GNIS today; `cli/src/ingest/gnis.ts`'s doc
 * comment covers why the shape is source-agnostic — future sources are additional adapter files
 * producing this same intermediate, mirroring `NormalizedAddress`'s role for OpenAddresses.
 */
export interface NormalizedGazetteerRecord {
    nameMatch: string;
    nameDisplay: string;
    featureClass: string;
    county: string;
    state: string;
    lat: number;
    lon: number;
}

/** Reserved exclusively for gazetteer (place-name) packs — a structurally different manifest and
 *  section vocabulary from the address pack, sharing only the outer container framing. See
 *  docs/PACK_FORMAT.md's "Gazetteer container (version 2)" section. */
export const PACK_VERSION_GAZETTEER = 2;

/** Geonames are far sparser than addresses, so the default reverse-lookup grid cell is larger
 *  than the address default (`DEFAULT_CELL_SIZE_DEG` above) — still a plain `--cell-size`
 *  override on the `build-gazetteer` subcommand. */
export const DEFAULT_GAZETTEER_CELL_SIZE_DEG = 0.02;

export interface GazetteerManifest {
    version: number;
    createdAt: string;
    region: string;
    sourceName: string;
    recordCount: number;
    cellSizeDeg: number;
    sections: PackSectionMeta[];
}
