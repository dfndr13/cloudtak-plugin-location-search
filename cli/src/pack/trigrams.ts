/**
 * Trigram postings for the fuzzy street-name path (PLAN.md §4.1 step 3). Every street's
 * match-form is padded with a boundary symbol so edge trigrams (start/end of the name) are
 * indexed too, then scored by shared-trigram count against a query at search time.
 *
 * The alphabet/packing scheme (`packTrigram`/`trigramsOf`) lives in `lib/pack/trigrams.ts`,
 * shared with the search-time query matcher, so build time and search time can never disagree
 * about what a trigram key means. `docs/PACK_FORMAT.md` describes the on-disk layout.
 */
import { ensureAligned } from "./bytes.ts";
import { trigramsOf } from "../../../lib/pack/trigrams.ts";

export { TRIGRAM_ALPHABET, packTrigram, trigramsOf } from "../../../lib/pack/trigrams.ts";
export type { TrigramPostings } from "../../../lib/pack/types.ts";
import type { TrigramPostings } from "../../../lib/pack/types.ts";

export function buildTrigramPostings(streetMatchForms: readonly string[]): TrigramPostings {
    const streetIdsByTrigram = new Map<number, Set<number>>();

    streetMatchForms.forEach((matchForm, streetId) => {
        for (const key of trigramsOf(matchForm)) {
            let set = streetIdsByTrigram.get(key);
            if (!set) {
                set = new Set();
                streetIdsByTrigram.set(key, set);
            }
            set.add(streetId);
        }
    });

    const trigramKeys = [...streetIdsByTrigram.keys()].sort((a, b) => a - b);
    const postingsByTrigram = trigramKeys.map((key) => [...streetIdsByTrigram.get(key)!].sort((a, b) => a - b));

    return { trigramKeys, postingsByTrigram };
}

export function encodeTrigramPostings(postings: TrigramPostings): Buffer {
    const { trigramKeys, postingsByTrigram } = postings;
    const trigramCount = trigramKeys.length;

    const keysArr = new Uint32Array(trigramKeys);

    const offsets = new Uint32Array(trigramCount + 1);
    let cursor = 0;
    for (let i = 0; i < trigramCount; i++) {
        offsets[i] = cursor;
        cursor += postingsByTrigram[i]!.length;
    }
    offsets[trigramCount] = cursor;

    const postingsFlat = new Uint32Array(cursor);
    let w = 0;
    for (const list of postingsByTrigram) {
        postingsFlat.set(list, w);
        w += list.length;
    }

    const header = Buffer.alloc(4);
    header.writeUInt32LE(trigramCount, 0);

    return Buffer.concat([
        header,
        Buffer.from(keysArr.buffer, keysArr.byteOffset, keysArr.byteLength),
        Buffer.from(offsets.buffer, offsets.byteOffset, offsets.byteLength),
        Buffer.from(postingsFlat.buffer, postingsFlat.byteOffset, postingsFlat.byteLength),
    ]);
}

export function decodeTrigramPostings(rawBuf: Buffer): TrigramPostings {
    const buf = ensureAligned(rawBuf);
    const trigramCount = buf.readUInt32LE(0);
    let cursor = 4;

    const keys = new Uint32Array(buf.buffer, buf.byteOffset + cursor, trigramCount);
    cursor += trigramCount * 4;

    const offsets = new Uint32Array(buf.buffer, buf.byteOffset + cursor, trigramCount + 1);
    cursor += (trigramCount + 1) * 4;

    const postingCount = offsets[trigramCount]!;
    const postings = new Uint32Array(buf.buffer, buf.byteOffset + cursor, postingCount);

    const trigramKeys = [...keys];
    const postingsByTrigram = trigramKeys.map((_, i) => [...postings.subarray(offsets[i]!, offsets[i + 1]!)]);

    return { trigramKeys, postingsByTrigram };
}
