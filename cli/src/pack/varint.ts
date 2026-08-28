/** Standard unsigned LEB128 varint encode/decode, used for delta-encoded cell address lists. */

export function encodeVarint(value: number, out: number[]): void {
    let v = value >>> 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (v < 0x80) {
            out.push(v);
            return;
        }
        out.push((v & 0x7f) | 0x80);
        v >>>= 7;
    }
}

/** Returns [value, bytesConsumed]. */
export function decodeVarint(buf: Buffer, offset: number): [number, number] {
    let result = 0;
    let shift = 0;
    let cursor = offset;
    for (;;) {
        const byte = buf[cursor]!;
        cursor++;
        result |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
    }
    return [result >>> 0, cursor - offset];
}
