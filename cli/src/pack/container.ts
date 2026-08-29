import { createHash } from "node:crypto";
import {
    PACK_MAGIC,
    PACK_VERSION,
    PACK_VERSION_GAZETTEER,
    type PackManifest,
    type PackSectionMeta,
    type GazetteerManifest,
} from "./types.ts";

export interface SectionInput {
    id: string;
    kind: string;
    bytes: Buffer;
    compressed: boolean;
    count?: number;
}

function sha256(buf: Buffer): string {
    return createHash("sha256").update(buf).digest("hex");
}

export function writePack(
    sections: readonly SectionInput[],
    meta: { region: string; addressCount: number; cellSizeDeg: number },
): Buffer {
    // Manifest byte offsets depend on the manifest's own length, which depends on the offsets —
    // resolved by writing the manifest once with placeholder offsets to measure its length, then
    // writing it again now that the true header size (and thus every offset) is known.
    const buildManifest = (headerSize: number): PackManifest => {
        let cursor = headerSize;
        const sectionMetas: PackSectionMeta[] = sections.map((s) => {
            const meta: PackSectionMeta = {
                id: s.id,
                kind: s.kind,
                byteOffset: cursor,
                byteLength: s.bytes.byteLength,
                compressed: s.compressed,
                checksum: sha256(s.bytes),
                ...(s.count !== undefined ? { count: s.count } : {}),
            };
            cursor += s.bytes.byteLength;
            return meta;
        });
        return {
            version: PACK_VERSION,
            createdAt: new Date().toISOString(),
            region: meta.region,
            addressCount: meta.addressCount,
            cellSizeDeg: meta.cellSizeDeg,
            sections: sectionMetas,
        };
    };

    // First pass with headerSize=0 just to get a manifest JSON of the right shape/length.
    const provisionalJson = JSON.stringify(buildManifest(0));
    const headerSize = 4 + 4 + 4 + Buffer.byteLength(provisionalJson, "utf8");
    const finalManifest = buildManifest(headerSize);
    const finalJson = JSON.stringify(finalManifest);

    if (Buffer.byteLength(finalJson, "utf8") !== Buffer.byteLength(provisionalJson, "utf8")) {
        // Offsets can, in principle, gain a digit and lengthen the JSON. Recompute once more.
        const headerSize2 = 4 + 4 + 4 + Buffer.byteLength(finalJson, "utf8");
        return assemble(buildManifest(headerSize2), sections);
    }

    return assemble(finalManifest, sections);
}

/**
 * Version-2 sibling of `writePack` — same two-pass offset-resolution trick (the manifest's own
 * byte length affects the section offsets it lists, so it's built once to measure, then again for
 * real), but for a `GazetteerManifest` instead. Kept separate from `writePack` rather than
 * overloading its signature with an "extra fields" bag, so each manifest shape stays explicit and
 * typed.
 */
export function writeGazetteerPack(
    sections: readonly SectionInput[],
    meta: { region: string; sourceName: string; recordCount: number; cellSizeDeg: number },
): Buffer {
    const buildManifest = (headerSize: number): GazetteerManifest => {
        let cursor = headerSize;
        const sectionMetas: PackSectionMeta[] = sections.map((s) => {
            const sectionMeta: PackSectionMeta = {
                id: s.id,
                kind: s.kind,
                byteOffset: cursor,
                byteLength: s.bytes.byteLength,
                compressed: s.compressed,
                checksum: sha256(s.bytes),
                ...(s.count !== undefined ? { count: s.count } : {}),
            };
            cursor += s.bytes.byteLength;
            return sectionMeta;
        });
        return {
            version: PACK_VERSION_GAZETTEER,
            createdAt: new Date().toISOString(),
            region: meta.region,
            sourceName: meta.sourceName,
            recordCount: meta.recordCount,
            cellSizeDeg: meta.cellSizeDeg,
            sections: sectionMetas,
        };
    };

    const provisionalJson = JSON.stringify(buildManifest(0));
    const headerSize = 4 + 4 + 4 + Buffer.byteLength(provisionalJson, "utf8");
    const finalManifest = buildManifest(headerSize);
    const finalJson = JSON.stringify(finalManifest);

    if (Buffer.byteLength(finalJson, "utf8") !== Buffer.byteLength(provisionalJson, "utf8")) {
        const headerSize2 = 4 + 4 + 4 + Buffer.byteLength(finalJson, "utf8");
        return assemble(buildManifest(headerSize2), sections);
    }

    return assemble(finalManifest, sections);
}

function assemble(manifest: PackManifest | GazetteerManifest, sections: readonly SectionInput[]): Buffer {
    const manifestJson = Buffer.from(JSON.stringify(manifest), "utf8");
    const header = Buffer.alloc(4 + 4 + 4);
    header.write(PACK_MAGIC, 0, "ascii");
    header.writeUInt32LE(manifest.version, 4);
    header.writeUInt32LE(manifestJson.byteLength, 8);

    return Buffer.concat([header, manifestJson, ...sections.map((s) => s.bytes)]);
}

/** Versions this container reader recognizes at all, across every pack "kind" — anything else is
 *  refused outright. Each kind-specific reader below (`readPackManifest`/`readGazetteerManifest`)
 *  additionally refuses the *other* kind's version, so a reader for one kind can never silently
 *  misinterpret the other's manifest shape. */
const KNOWN_VERSIONS = new Set<number>([PACK_VERSION, PACK_VERSION_GAZETTEER]);

function readManifestRaw(fileBuf: Buffer): { version: number; json: Record<string, unknown> } {
    const magic = fileBuf.toString("ascii", 0, 4);
    if (magic !== PACK_MAGIC) {
        throw new Error(`not a pack file: bad magic ${JSON.stringify(magic)}`);
    }
    const version = fileBuf.readUInt32LE(4);
    if (!KNOWN_VERSIONS.has(version)) {
        throw new Error(`unsupported pack version ${version}, expected one of ${[...KNOWN_VERSIONS].join(", ")}`);
    }
    const manifestLength = fileBuf.readUInt32LE(8);
    const manifestJson = fileBuf.toString("utf8", 12, 12 + manifestLength);
    return { version, json: JSON.parse(manifestJson) as Record<string, unknown> };
}

export function readPackManifest(fileBuf: Buffer): PackManifest {
    const { version, json } = readManifestRaw(fileBuf);
    if (version !== PACK_VERSION) {
        throw new Error(`expected an address pack (version ${PACK_VERSION}), got version ${version}`);
    }
    return json as unknown as PackManifest;
}

export function readGazetteerManifest(fileBuf: Buffer): GazetteerManifest {
    const { version, json } = readManifestRaw(fileBuf);
    if (version !== PACK_VERSION_GAZETTEER) {
        throw new Error(`expected a gazetteer pack (version ${PACK_VERSION_GAZETTEER}), got version ${version}`);
    }
    return json as unknown as GazetteerManifest;
}

/**
 * Returns a **copy** of a section's bytes, not a view — guarantees the result starts at a
 * zero, 4-byte-aligned offset regardless of where the section falls in the file, matching what
 * `Blob.slice().arrayBuffer()` naturally gives a browser reader. See pack/bytes.ts.
 */
export function readSection(fileBuf: Buffer, section: PackSectionMeta): Buffer {
    const raw = fileBuf.subarray(section.byteOffset, section.byteOffset + section.byteLength);
    const actualChecksum = sha256(raw);
    if (actualChecksum !== section.checksum) {
        throw new Error(`checksum mismatch for section ${section.id}`);
    }
    return Buffer.from(raw);
}

export function getSection(manifest: PackManifest | GazetteerManifest, id: string): PackSectionMeta {
    const section = manifest.sections.find((s) => s.id === id);
    if (!section) throw new Error(`section not found: ${id}`);
    return section;
}
