/**
 * String table codec: one UTF-8 blob + a Uint32Array of offsets, so a read is a slice, never a
 * parse. Used for streets, places, units, and numberExtra. See docs/PACK_FORMAT.md.
 */
import { ensureAligned } from "./bytes.ts";

export interface StringTable {
    /** string -> id, in insertion order unless the caller sorts first. */
    values: string[];
}

export function buildStringTable(values: string[]): StringTable {
    return { values };
}

/** Interns strings, returning stable ids and the deduped, ordered value list. */
export class StringInterner {
    private readonly idByValue = new Map<string, number>();
    private readonly values: string[] = [];

    intern(value: string): number {
        const existing = this.idByValue.get(value);
        if (existing !== undefined) return existing;
        const id = this.values.length;
        this.idByValue.set(value, id);
        this.values.push(value);
        return id;
    }

    get size(): number {
        return this.values.length;
    }

    toArray(): string[] {
        return this.values;
    }
}

export function encodeStringTable(values: readonly string[]): Buffer {
    const encoder = new TextEncoder();
    const encoded = values.map((v) => encoder.encode(v));
    const count = encoded.length;

    const offsets = new Uint32Array(count + 1);
    let cursor = 0;
    for (let i = 0; i < count; i++) {
        offsets[i] = cursor;
        cursor += encoded[i]!.length;
    }
    offsets[count] = cursor;

    const header = Buffer.alloc(4);
    header.writeUInt32LE(count, 0);

    const offsetsBuf = Buffer.from(offsets.buffer, offsets.byteOffset, offsets.byteLength);
    const blob = Buffer.concat(encoded.map((e) => Buffer.from(e)));

    return Buffer.concat([header, offsetsBuf, blob]);
}

export function decodeStringTable(rawBuf: Buffer): string[] {
    const buf = ensureAligned(rawBuf);
    const count = buf.readUInt32LE(0);
    const offsetsStart = 4;
    const offsetsByteLen = 4 * (count + 1);
    const offsets = new Uint32Array(
        buf.buffer,
        buf.byteOffset + offsetsStart,
        count + 1,
    );
    const blobStart = offsetsStart + offsetsByteLen;
    const decoder = new TextDecoder();
    const out: string[] = new Array(count);
    for (let i = 0; i < count; i++) {
        const start = blobStart + offsets[i]!;
        const end = blobStart + offsets[i + 1]!;
        out[i] = decoder.decode(buf.subarray(start, end));
    }
    return out;
}
