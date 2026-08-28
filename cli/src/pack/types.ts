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
