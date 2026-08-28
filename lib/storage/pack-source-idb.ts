/**
 * `PackSource` (the interface from Phase 2's lib/pack/pack-source.ts) backed by this plugin's
 * own IndexedDB, instead of a single in-memory file. This is what makes `SearchIndex` — built and
 * latency-tested in Phase 2 against a Node file source — work unmodified against real per-device
 * browser storage.
 */
import { idbGet } from "./idb.ts";
import { withAddressSearchDb, SECTIONS_STORE, sectionKey } from "./schema.ts";
import { verifySection, getSection } from "../pack/container.ts";
import type { PackSource } from "../pack/pack-source.ts";
import type { PackManifest } from "../pack/types.ts";

export class IndexedDbPackSource implements PackSource {
    private readonly datasetId: string;
    private readonly manifestValue: PackManifest;

    constructor(datasetId: string, manifest: PackManifest) {
        this.datasetId = datasetId;
        this.manifestValue = manifest;
    }

    async manifest(): Promise<PackManifest> {
        return this.manifestValue;
    }

    async readSection(id: string): Promise<Uint8Array> {
        const bytes = await withAddressSearchDb((db) => idbGet<Uint8Array>(db, SECTIONS_STORE, sectionKey(this.datasetId, id)));
        if (!bytes) throw new Error(`section not found in storage: ${this.datasetId}:${id}`);
        await verifySection(bytes, getSection(this.manifestValue, id));
        return bytes;
    }
}
