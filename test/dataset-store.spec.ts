import { describe, expect, it, beforeEach } from "vitest";
import {
    createDataset,
    listDatasets,
    getDataset,
    setEnabled,
    renameDataset,
    removeDataset,
} from "../lib/storage/dataset-store.ts";
import { idbGet, idbPut } from "../lib/storage/idb.ts";
import { openAddressSearchDb, SECTIONS_STORE, sectionKey } from "../lib/storage/schema.ts";
import { resetAddressSearchDb } from "./storage-test-helpers.ts";
import type { PackManifest } from "../lib/pack/types.ts";

const FAKE_MANIFEST: PackManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    region: "TEST",
    addressCount: 100,
    cellSizeDeg: 0.005,
    sections: [],
};

beforeEach(async () => {
    await resetAddressSearchDb();
});

describe("createDataset", () => {
    it("creates a record with the requested enabled flag", async () => {
        const record = await createDataset(
            { label: "Test", region: "TEST", addressCount: 100, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST },
            true,
        );
        expect(record.label).toBe("Test");
        expect(record.enabled).toBe(true);
        expect(record.datasetId).toBeTruthy();
        // Node has no navigator.storage — persistence best-effort should degrade to false, not throw.
        expect(record.persisted).toBe(false);
    });

    it("uses the supplied datasetId when given one (upload.ts needs this to key sections first)", async () => {
        const record = await createDataset(
            { label: "Test", region: "TEST", addressCount: 100, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST },
            true,
            "fixed-id",
        );
        expect(record.datasetId).toBe("fixed-id");
    });
});

describe("listDatasets / getDataset", () => {
    it("lists everything created", async () => {
        await createDataset({ label: "A", region: "TEST", addressCount: 1, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST }, true);
        await createDataset({ label: "B", region: "TEST", addressCount: 1, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST }, false);
        const all = await listDatasets();
        expect(all.map((d) => d.label).sort()).toEqual(["A", "B"]);
    });

    it("returns undefined for an unknown id", async () => {
        expect(await getDataset("nope")).toBeUndefined();
    });
});

describe("setEnabled / renameDataset", () => {
    it("toggles the enabled flag without touching other fields", async () => {
        const record = await createDataset(
            { label: "Test", region: "TEST", addressCount: 1, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST },
            false,
        );
        await setEnabled(record.datasetId, true);
        const updated = await getDataset(record.datasetId);
        expect(updated!.enabled).toBe(true);
        expect(updated!.label).toBe("Test");
    });

    it("renames a dataset", async () => {
        const record = await createDataset(
            { label: "Old", region: "TEST", addressCount: 1, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST },
            true,
        );
        await renameDataset(record.datasetId, "New");
        expect((await getDataset(record.datasetId))!.label).toBe("New");
    });

    it("throws for an unknown dataset", async () => {
        await expect(setEnabled("nope", true)).rejects.toThrow();
        await expect(renameDataset("nope", "x")).rejects.toThrow();
    });
});

describe("removeDataset", () => {
    it("removes the dataset record and every one of its section records, leaving other datasets' sections alone", async () => {
        const a = await createDataset({ label: "A", region: "TEST", addressCount: 1, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST }, true);
        const b = await createDataset({ label: "B", region: "TEST", addressCount: 1, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST }, true);

        const db = await openAddressSearchDb();
        await idbPut(db, SECTIONS_STORE, new Uint8Array([1]), sectionKey(a.datasetId, "streets"));
        await idbPut(db, SECTIONS_STORE, new Uint8Array([2]), sectionKey(b.datasetId, "streets"));

        await removeDataset(a.datasetId);

        expect(await getDataset(a.datasetId)).toBeUndefined();
        expect(await idbGet(db, SECTIONS_STORE, sectionKey(a.datasetId, "streets"))).toBeUndefined();
        expect(await idbGet(db, SECTIONS_STORE, sectionKey(b.datasetId, "streets"))).toEqual(new Uint8Array([2]));
        db.close(); // must close, or the next test's beforeEach reset (deleteDatabase) hangs waiting for this connection
    });
});
