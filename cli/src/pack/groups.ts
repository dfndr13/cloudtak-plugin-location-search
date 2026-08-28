import type { NormalizedAddress } from "./types.ts";
import type { StreetTable } from "./streets.ts";
import { type PlaceTable, placeNameFor } from "./places.ts";
import type { GroupPlacement } from "./chunks.ts";
import { ensureAligned } from "./bytes.ts";

export interface GroupDraft {
    streetId: number;
    placeId: number;
    postcodeId: number;
    /** Indices into the source `addresses` array, sorted by house number ascending. */
    memberIndices: number[];
    centroidLat: number;
    centroidLon: number;
}

function groupKey(streetId: number, placeId: number, postcodeId: number): string {
    return `${streetId}:${placeId}:${postcodeId}`;
}

/**
 * Groups addresses by (street x place x postcode) per PLAN.md §3.3, sorted so all groups for a
 * street are contiguous (required for the group-selection step in §4.1 to scan one range).
 */
export function buildGroups(
    addresses: readonly NormalizedAddress[],
    streets: StreetTable,
    places: PlaceTable,
): GroupDraft[] {
    const byKey = new Map<string, GroupDraft>();

    addresses.forEach((addr, index) => {
        const streetId = streets.streetIdOf.get(addr.streetMatch);
        if (streetId === undefined) {
            throw new Error(`street not found in table: ${addr.streetMatch}`);
        }
        const placeId = places.idOf.get(placeNameFor(addr)) ?? 0;
        const postcodeId = places.idOf.get(addr.postcode) ?? 0;

        const key = groupKey(streetId, placeId, postcodeId);
        let group = byKey.get(key);
        if (!group) {
            group = { streetId, placeId, postcodeId, memberIndices: [], centroidLat: 0, centroidLon: 0 };
            byKey.set(key, group);
        }
        group.memberIndices.push(index);
    });

    for (const group of byKey.values()) {
        let sumLat = 0;
        let sumLon = 0;
        for (const idx of group.memberIndices) {
            sumLat += addresses[idx]!.lat;
            sumLon += addresses[idx]!.lon;
        }
        group.centroidLat = sumLat / group.memberIndices.length;
        group.centroidLon = sumLon / group.memberIndices.length;
        group.memberIndices.sort((a, b) => addresses[a]!.number - addresses[b]!.number);
    }

    return [...byKey.values()].sort((a, b) => {
        return a.streetId - b.streetId || a.placeId - b.placeId || a.postcodeId - b.postcodeId;
    });
}

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

/** Struct-of-arrays encode: 8 parallel Uint32/Int32 arrays, back to back, each length `count`. */
export function encodeGroups(groups: readonly GroupDraft[], placements: readonly GroupPlacement[]): Buffer {
    const count = groups.length;
    const streetId = new Uint32Array(count);
    const placeId = new Uint32Array(count);
    const postcodeId = new Uint32Array(count);
    const centroidLat = new Int32Array(count);
    const centroidLon = new Int32Array(count);
    const chunkId = new Uint32Array(count);
    const rowOffset = new Uint32Array(count);
    const rowCount = new Uint32Array(count);

    groups.forEach((g, i) => {
        const p = placements[i]!;
        streetId[i] = g.streetId;
        placeId[i] = g.placeId;
        postcodeId[i] = g.postcodeId;
        centroidLat[i] = p.centroidLatE7;
        centroidLon[i] = p.centroidLonE7;
        chunkId[i] = p.chunkId;
        rowOffset[i] = p.rowOffset;
        rowCount[i] = p.rowCount;
    });

    const toBuf = (a: Uint32Array | Int32Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
    return Buffer.concat([streetId, placeId, postcodeId, centroidLat, centroidLon, chunkId, rowOffset, rowCount].map(toBuf));
}

export function decodeGroups(rawBuf: Buffer, count: number): DecodedGroup[] {
    const buf = ensureAligned(rawBuf);
    const bytesPerArray = count * 4;

    let cursor = buf.byteOffset;
    const view = (Ctor: typeof Uint32Array | typeof Int32Array) => {
        const arr = new Ctor(buf.buffer as ArrayBuffer, cursor, count);
        cursor += bytesPerArray;
        return arr;
    };

    const streetId = view(Uint32Array);
    const placeId = view(Uint32Array);
    const postcodeId = view(Uint32Array);
    const centroidLat = view(Int32Array);
    const centroidLon = view(Int32Array);
    const chunkId = view(Uint32Array);
    const rowOffset = view(Uint32Array);
    const rowCount = view(Uint32Array);

    const out: DecodedGroup[] = new Array(count);
    for (let i = 0; i < count; i++) {
        out[i] = {
            streetId: streetId[i]!,
            placeId: placeId[i]!,
            postcodeId: postcodeId[i]!,
            centroidLatE7: centroidLat[i]!,
            centroidLonE7: centroidLon[i]!,
            chunkId: chunkId[i]!,
            rowOffset: rowOffset[i]!,
            rowCount: rowCount[i]!,
        };
    }
    return out;
}
