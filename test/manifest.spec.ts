import { describe, expect, it } from "vitest";
import { buildManifest } from "../lib/manifest.ts";
import type { AddressDatasetRecord, GazetteerDatasetRecord } from "../lib/storage/schema.ts";

function addressDataset(overrides: Partial<AddressDatasetRecord> = {}): AddressDatasetRecord {
    return {
        kind: "address",
        datasetId: "id",
        label: "Label",
        region: "AZ",
        addressCount: 100,
        cellSizeDeg: 0.005,
        manifest: { version: 1, createdAt: "", region: "AZ", addressCount: 100, cellSizeDeg: 0.005, sections: [] },
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        persisted: true,
        ...overrides,
    };
}

function gazetteerDataset(overrides: Partial<GazetteerDatasetRecord> = {}): GazetteerDatasetRecord {
    return {
        kind: "gazetteer",
        datasetId: "gaz-id",
        label: "AZ Places",
        region: "AZ",
        recordCount: 26705,
        cellSizeDeg: 0.02,
        manifest: {
            version: 2,
            createdAt: "",
            region: "AZ",
            sourceName: "USGS GNIS",
            recordCount: 26705,
            cellSizeDeg: 0.02,
            sections: [],
        },
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        persisted: true,
        ...overrides,
    };
}

describe("buildManifest (PLAN.md §6's cross-plugin manifest shape)", () => {
    it("projects only the public fields of an address dataset", () => {
        const manifest = buildManifest([addressDataset({ label: "AZ-Coconino", region: "AZ", addressCount: 90993, enabled: true })]);
        expect(manifest.version).toBe(1);
        expect(manifest.datasets).toEqual([{ label: "AZ-Coconino", region: "AZ", addressCount: 90993, enabled: true, kind: "address" }]);
    });

    it("projects a gazetteer dataset with recordCount instead of addressCount (Phase 8)", () => {
        const manifest = buildManifest([gazetteerDataset({ label: "AZ Places", region: "AZ", recordCount: 26705, enabled: false })]);
        expect(manifest.datasets).toEqual([{ label: "AZ Places", region: "AZ", recordCount: 26705, enabled: false, kind: "gazetteer" }]);
    });

    it("never leaks internal-only fields (datasetId, manifest, cellSizeDeg, sourceUrl, persisted)", () => {
        const manifest = buildManifest([addressDataset({ sourceUrl: "https://example.com/state.pack" })]);
        const keys = Object.keys(manifest.datasets[0]!);
        expect(keys.sort()).toEqual(["addressCount", "enabled", "kind", "label", "region"]);
    });

    it("includes every dataset, enabled or not, mixing address and gazetteer kinds", () => {
        const manifest = buildManifest([addressDataset({ label: "A", enabled: true }), gazetteerDataset({ label: "B", enabled: false })]);
        expect(manifest.datasets.map((d) => d.label)).toEqual(["A", "B"]);
        expect(manifest.datasets.map((d) => d.kind)).toEqual(["address", "gazetteer"]);
    });

    it("produces an empty datasets array, not an error, when nothing is loaded", () => {
        expect(buildManifest([])).toEqual({ version: 1, updatedAt: expect.any(String), datasets: [] });
    });

    it("stamps a fresh ISO timestamp", () => {
        const before = Date.now();
        const manifest = buildManifest([]);
        expect(new Date(manifest.updatedAt).getTime()).toBeGreaterThanOrEqual(before);
    });
});
