import { PACK_MAGIC, PACK_VERSION, type PackManifest, type PackSectionMeta } from "./types.ts";

const textDecoder = new TextDecoder();

export function readPackManifest(bytes: Uint8Array): PackManifest {
    const magic = textDecoder.decode(bytes.subarray(0, 4));
    if (magic !== PACK_MAGIC) {
        throw new Error(`not a pack file: bad magic ${JSON.stringify(magic)}`);
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = view.getUint32(4, true);
    if (version !== PACK_VERSION) {
        throw new Error(`unsupported pack version ${version}, expected ${PACK_VERSION}`);
    }
    const manifestLength = view.getUint32(8, true);
    const manifestJson = textDecoder.decode(bytes.subarray(12, 12 + manifestLength));
    return JSON.parse(manifestJson) as PackManifest;
}

export function getSection(manifest: PackManifest, id: string): PackSectionMeta {
    const section = manifest.sections.find((s) => s.id === id);
    if (!section) throw new Error(`section not found: ${id}`);
    return section;
}

/** SHA-256 hex digest via the standard Web Crypto API — identical in Node and the browser. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Gzip inflate via the standard Streams API — identical in Node (18+) and the browser. */
export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
}

export async function verifySection(bytes: Uint8Array, section: PackSectionMeta): Promise<void> {
    const actual = await sha256Hex(bytes);
    if (actual !== section.checksum) {
        throw new Error(`checksum mismatch for section ${section.id}`);
    }
}
