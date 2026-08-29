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
import { openAddressSearchDb, DATASETS_STORE, SECTIONS_STORE, sectionKey } from "../lib/storage/schema.ts";
import { resetAddressSearchDb } from "./storage-test-helpers.ts";
import type { PackManifest, GazetteerManifest } from "../lib/pack/types.ts";

const FAKE_MANIFEST: PackManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    region: "TEST",
    addressCount: 100,
    cellSizeDeg: 0.005,
    sections: [],
};

const FAKE_GAZETTEER_MANIFEST: GazetteerManifest = {
    version: 2,
    createdAt: new Date().toISOString(),
    region: "AZ",
    sourceName: "USGS GNIS",
    recordCount: 50,
    cellSizeDeg: 0.02,
    sections: [],
};

beforeEach(async () => {
    await resetAddressSearchDb();
});

describe("createDataset", () => {
    it("creates a record with the requested enabled flag", async () => {
        const record = await createDataset(
            { kind: "address", label: "Test", region: "TEST", addressCount: 100, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST },
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
            { kind: "address", label: "Test", region: "TEST", addressCount: 100, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST },
            true,
            "fixed-id",
        );
        expect(record.datasetId).toBe("fixed-id");
    });
});

describe("listDatasets / getDataset", () => {
    it("lists everything created", async () => {
        await createDataset({ kind: "address", label: "A", region: "TEST", addressCount: 1, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST }, true);
        await createDataset({ kind: "address", label: "B", region: "TEST", addressCount: 1, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST }, false);
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
            { kind: "address", label: "Test", region: "TEST", addressCount: 1, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST },
            false,
        );
        await setEnabled(record.datasetId, true);
        const updated = await getDataset(record.datasetId);
        expect(updated!.enabled).toBe(true);
        expect(updated!.label).toBe("Test");
    });

    it("renames a dataset", async () => {
        const record = await createDataset(
            { kind: "address", label: "Old", region: "TEST", addressCount: 1, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST },
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
        const a = await createDataset({ kind: "address", label: "A", region: "TEST", addressCount: 1, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST }, true);
        const b = await createDataset({ kind: "address", label: "B", region: "TEST", addressCount: 1, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST }, true);

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

describe("gazetteer datasets (Phase 8)", () => {
    it("creates and lists a gazetteer-kind record alongside address-kind ones", async () => {
        await createDataset({ kind: "address", label: "Addresses", region: "TEST", addressCount: 1, cellSizeDeg: 0.005, manifest: FAKE_MANIFEST }, true);
        const gaz = await createDataset(
            { kind: "gazetteer", label: "Places", region: "AZ", recordCount: 50, cellSizeDeg: 0.02, manifest: FAKE_GAZETTEER_MANIFEST },
            true,
        );

        expect(gaz.kind).toBe("gazetteer");
        if (gaz.kind === "gazetteer") expect(gaz.recordCount).toBe(50);

        const all = await listDatasets();
        expect(all.map((d) => d.kind).sort()).toEqual(["address", "gazetteer"]);
    });
});

describe("legacy records predating the `kind` field", () => {
    it("normalizes a stored record with no `kind` at all to kind: 'address' on read", async () => {
        // Real state on the user's own dev/VPS CloudTAK instances (Phases 3-6, before Phase 8
        // introduced `kind`) — written directly here, bypassing createDataset, to simulate exactly
        // what's already sitting in a real user's IndexedDB.
        const legacyRecord = {
            datasetId: "legacy-1",
            label: "Legacy AZ",
            region: "AZ",
            addressCount: 42,
            cellSizeDeg: 0.005,
            manifest: FAKE_MANIFEST,
            enabled: true,
            createdAt: new Date().toISOString(),
            persisted: false,
        };
        const db = await openAddressSearchDb();
        await idbPut(db, DATASETS_STORE, legacyRecord);
        db.close();

        const fetched = await getDataset("legacy-1");
        expect(fetched?.kind).toBe("address");
        expect(fetched && fetched.kind === "address" && fetched.addressCount).toBe(42);

        const all = await listDatasets();
        expect(all.find((d) => d.datasetId === "legacy-1")?.kind).toBe("address");
    });
});
