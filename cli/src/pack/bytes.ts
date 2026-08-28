/**
 * `Uint32Array`/`Int32Array` views require their backing buffer to start at an offset that's a
 * multiple of 4. A `Buffer` sliced out of a larger file buffer (`subarray`, no copy) doesn't
 * guarantee that. In the browser this is moot — `Blob.slice().arrayBuffer()` always returns a
 * fresh, zero-offset `ArrayBuffer` — but our own Node-side reader (used by tests and by the CLI
 * itself for round-trips) has to guard for it explicitly.
 */
export function ensureAligned(buf: Buffer, byteAlignment = 4): Buffer {
    return buf.byteOffset % byteAlignment === 0 ? buf : Buffer.from(buf);
}
