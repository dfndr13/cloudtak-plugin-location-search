import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, beforeEach, beforeAll } from "vitest";
import { buildPack } from "../cli/src/pack/build.ts";
import { readPackManifest } from "../lib/pack/container.ts";
import { IndexedDbPackSource } from "../lib/storage/pack-source-idb.ts";
import { openAddressSearchDb, SECTIONS_STORE, sectionKey } from "../lib/storage/schema.ts";
import { idbPut } from "../lib/storage/idb.ts";
import { resetAddressSearchDb } from "./storage-test-helpers.ts";
import type { PackManifest } from "../lib/pack/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "../cli/fixtures/sample-county.ndjson");
const DATASET_ID = "test-dataset";

let pack: Uint8Array;
let manifest: PackManifest;

beforeAll(async () => {
    const built = await buildPack({ inputFiles: [FIXTURE], region: "TEST" });
    pack = new Uint8Array(built.pack);
    manifest = readPackManifest(pack);
});

beforeEach(async () => {
    await resetAddressSearchDb();
});

async function writeAllSections(): Promise<void> {
    const db = await openAddressSearchDb();
    for (const section of manifest.sections) {
        const bytes = pack.slice(section.byteOffset, section.byteOffset + section.byteLength);
        await idbPut(db, SECTIONS_STORE, bytes, sectionKey(DATASET_ID, section.id));
    }
    db.close(); // must close, or the next test's beforeEach reset (deleteDatabase) hangs waiting for this connection
}

describe("IndexedDbPackSource", () => {
    it("reads back a section matching the original bytes", async () => {
        await writeAllSections();
        const source = new IndexedDbPackSource(DATASET_ID, manifest);
        const streetsSection = manifest.sections.find((s) => s.id === "streets")!;
        const expected = pack.slice(streetsSection.byteOffset, streetsSection.byteOffset + streetsSection.byteLength);
        expect(await source.readSection("streets")).toEqual(expected);
    });

    it("returns the manifest it was constructed with", async () => {
        const source = new IndexedDbPackSource(DATASET_ID, manifest);
        expect(await source.manifest()).toBe(manifest);
    });

    it("throws when a section was never written", async () => {
        const source = new IndexedDbPackSource(DATASET_ID, manifest);
        await expect(source.readSection("streets")).rejects.toThrow(/not found/);
    });

    it("throws when a stored section's bytes were corrupted", async () => {
        await writeAllSections();
        const db = await openAddressSearchDb();
        const corrupted = new Uint8Array([9, 9, 9, 9]);
        await idbPut(db, SECTIONS_STORE, corrupted, sectionKey(DATASET_ID, "streets"));
        db.close();

        const source = new IndexedDbPackSource(DATASET_ID, manifest);
        await expect(source.readSection("streets")).rejects.toThrow(/checksum/);
    });
});
