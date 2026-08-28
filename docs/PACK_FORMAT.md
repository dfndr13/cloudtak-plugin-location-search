# Pack format

Byte-level spec for the `.pack` file produced by `cli/` and consumed (starting Phase 2) by the
browser plugin. See [`PLAN.md`](PLAN.md) §3 for the rationale and size budgets. This document is
authoritative for the on-disk/on-wire layout; the plan document is authoritative for the reasoning.

All multi-byte integers are little-endian. All coordinates are WGS84 degrees.

## Container

```
offset  size      field
0       4         magic = ASCII "CTAS"
4       4         version : uint32   (currently 1)
8       4         manifestLength : uint32
12      manifestLength   manifest : UTF-8 JSON
12+manifestLength ...    sections, concatenated, each at the byteOffset given in the manifest
```

A reader must check `magic` and refuse (with a re-import prompt, per PLAN.md's pack-format-churn
risk) on any `version` it doesn't recognize. `byteOffset` in the manifest is absolute from the
start of the file, so sections can be read independently via `File.slice()` / `Blob.slice()`
without walking the container sequentially.

### Manifest JSON shape

```ts
interface PackManifest {
  version: number;
  createdAt: string;        // ISO 8601
  region: string;           // free-text label, e.g. "AZ-Maricopa" or "AZ"
  addressCount: number;
  cellSizeDeg: number;      // grid size used for the reverse index, see Cells below
  sections: PackSection[];
}

interface PackSection {
  id: string;                // 'streets' | 'places' | 'groups' | 'trigrams' | 'units'
                              // | 'cellDir' | 'cellLists' | 'numberExtra'
                              // | 'chunk:<n>' for n in [0, chunkCount)
  kind: string;               // codec identifier, see per-section notes
  byteOffset: number;
  byteLength: number;         // length on disk (post-compression, where compressed)
  compressed: boolean;        // true => gzip; DecompressionStream('gzip') on read
  checksum: string;           // sha256 hex of the on-disk (possibly compressed) bytes
  count?: number;             // element count, where relevant (rows, entries, etc.)
}
```

## String table codec (`kind: "string-table"`)

Used for `streets`, `places`, `units`, and `numberExtra`. Layout:

```
offset  size            field
0       4               count : uint32
4       4*(count+1)     offsets : Uint32Array   (byte offsets into blob, ascending, offsets[count] = blob length)
4+4*(count+1)  ...      blob : UTF-8 bytes, strings concatenated with no separator
```

String `i` is `blob.slice(offsets[i], offsets[i+1])`. This makes every read a typed-array slice —
no parsing, no split. `streets` and `places` are additionally **sorted** so their own index doubles
as a binary-searchable prefix key (id = array index = sort position).

## `groups` (`kind: "groups-v1"`)

Struct-of-arrays, `count` rows:

```
streetId   : Uint32Array   index into streets[]
placeId    : Uint32Array   index into places[]
postcodeId : Uint32Array   index into places[] again (postcode reuses the places string table); 0xFFFFFFFF = none
centroidLat: Int32Array    1e-7 degrees, absolute (not delta)
centroidLon: Int32Array    1e-7 degrees, absolute
chunkId    : Uint32Array   which chunk section holds this group's address rows
rowOffset  : Uint32Array   first row index within that chunk
rowCount   : Uint32Array   number of contiguous rows for this group
```

Arrays are stored back-to-back in that field order, each length `count`, no interleaving — so a
consumer can view each field as its own typed array with one `byteOffset` math step. Groups are
sorted by `(streetId, placeId)` so all groups for a street are a contiguous range.

## `trigrams` (`kind: "trigram-postings-v1"`)

```
offset  size                field
0       4                   trigramCount : uint32
4       4*trigramCount      trigramKeys : Uint32Array, sorted ascending
                            (key = base-38 encoding of 3 chars: (code(a)*38 + code(b))*38 + code(c),
                             alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 #" — see
                             cli/src/pack/trigrams.ts TRIGRAM_ALPHABET / packTrigram)
4+4*trigramCount       4*trigramCount   postingOffsets : Uint32Array (index into postings, len trigramCount+1)
...                    postings : Uint32Array of streetId, sorted ascending within each trigram's range
```

Binary-search `trigramKeys` for a query trigram, then read `postings[postingOffsets[i] .. postingOffsets[i+1])`.

## `chunks` (`kind: "address-chunk-v1"`, one section per chunk, id `chunk:<n>`)

Each chunk is gzip'd independently (compressed:true) and holds a contiguous run of address rows
belonging to one or more groups (a chunk never splits a group). Decompressed layout, `count` rows:

```
number   : Uint32Array   house number, numeric part only
latD     : Int32Array    1e-7 degrees, delta from the OWNING GROUP's centroidLat
lonD     : Int32Array    1e-7 degrees, delta from the OWNING GROUP's centroidLon
unitRef  : Uint32Array   index into `units` string table; 0 = no unit
numExtra : Uint32Array   index into `numberExtra` string table; 0 = none (plain numeric number)
```

Rows within a group are sorted by `number` ascending so number resolution (PLAN.md §4.1 step 5) is
a binary search after the group's `[rowOffset, rowOffset+rowCount)` slice is located via the
group's `chunkId`.

## `cellDir` / `cellLists` (reverse index, PLAN.md §4.2)

Fixed grid, `cellSizeDeg` from the manifest (0.005 by default — ~550m N/S, ~460m E/W at 33°N).

```
latIdx(lat) = floor((lat + 90)  / cellSizeDeg)
lonIdx(lon) = floor((lon + 180) / cellSizeDeg)
LON_STEPS   = ceil(360 / cellSizeDeg)     // 72000 at 0.005°
cellKey     = latIdx * LON_STEPS + lonIdx  // fits Uint32: max ~36000*72000 = 2.592e9 < 2^32
```

`cellDir` (`kind: "cell-dir-v1"`), `count` occupied cells, sorted by `cellKey` ascending for binary
search / 9-neighbour lookup:

```
cellKeys     : Uint32Array (len count)
listOffsets  : Uint32Array (len count+1) — byte offsets into cellLists
```

`cellLists` (`kind: "cell-lists-v1"`) is one contiguous blob: for cell `i`,
`cellLists.slice(listOffsets[i], listOffsets[i+1])` is a **delta-varint** stream of ascending
**global address ordinals** (an address's position in a single logical concatenation of all chunks
in chunk order). A consumer turns an ordinal back into `(chunkId, rowOffset)` using each chunk's
`count` (carried in its section's manifest entry) and a running cumulative-sum — no extra index
needed, per PLAN.md §4.2.

Varint: standard LEB128 on `(delta)`, unsigned, since ordinals within one cell are stored sorted
ascending and delta-encoded from the previous ordinal in that cell's list (first entry is delta
from 0).

## Version history

- **v1** — initial format, this document.
