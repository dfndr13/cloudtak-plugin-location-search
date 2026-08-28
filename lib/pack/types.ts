/** Mirrors docs/PACK_FORMAT.md. Kept in sync by hand with cli/src/pack/types.ts's writer-side shape. */
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

export interface DecodedGroup {
    streetId: number;
    placeId: number;
    postcodeId: number;
    centroidLatE7: number;
    centroidLonE7: number;
    chunkId: number;
    rowOffset: number;
    rowCount: number;
}

export interface DecodedChunkRow {
    number: number;
    latD: number;
    lonD: number;
    unitRef: number;
    numExtra: number;
}

export interface TrigramPostings {
    trigramKeys: number[];
    postingsByTrigram: number[][];
}
