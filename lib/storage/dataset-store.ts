/**
 * CRUD over the `datasets` store. PLAN.md decision #8: storage is keyed per dataset from day
 * one, each with an enable toggle; all enabled datasets are searched, default is one enabled.
 */
import { idbDelete, idbDeleteRange, idbGet, idbGetAll, idbPut, prefixRange } from "./idb.ts";
import { withAddressSearchDb, DATASETS_STORE, SECTIONS_STORE, type DatasetRecord } from "./schema.ts";
import type { PackManifest } from "../pack/types.ts";

export function generateDatasetId(): string {
    return crypto.randomUUID();
}

/**
 * Requests persistent storage (docs/PLAN.md §5 — without this, iOS may silently evict the whole
 * dataset under disk pressure). Best-effort: some browsers/contexts don't expose the API at all.
 */
async function requestPersistence(): Promise<boolean> {
    try {
        if (!navigator.storage?.persist) return false;
        return await navigator.storage.persist();
    } catch {
        return false;
    }
}

export function listDatasets(): Promise<DatasetRecord[]> {
    return withAddressSearchDb((db) => idbGetAll<DatasetRecord>(db, DATASETS_STORE));
}

export function getDataset(datasetId: string): Promise<DatasetRecord | undefined> {
    return withAddressSearchDb((db) => idbGet<DatasetRecord>(db, DATASETS_STORE, datasetId));
}

export interface NewDatasetInput {
    label: string;
    region: string;
    addressCount: number;
    cellSizeDeg: number;
    manifest: PackManifest;
    sourceUrl?: string;
}

/**
 * Creates a dataset record. The default-enabled rule (decision #8: "default is one enabled") is
 * the caller's job — this always creates as requested; `upload.ts` checks `listDatasets()` first
 * and only defaults `enabled: true` when it's the very first dataset.
 *
 * `datasetId` can be supplied by the caller (upload.ts generates it up front, since it needs the
 * id to key section records BEFORE the dataset record itself is written) — a fresh one is
 * generated when omitted.
 */
export async function createDataset(
    input: NewDatasetInput,
    enabled: boolean,
    datasetId: string = generateDatasetId(),
): Promise<DatasetRecord> {
    const persisted = await requestPersistence();
    const record: DatasetRecord = {
        datasetId,
        label: input.label,
        region: input.region,
        addressCount: input.addressCount,
        cellSizeDeg: input.cellSizeDeg,
        manifest: input.manifest,
        enabled,
        createdAt: new Date().toISOString(),
        sourceUrl: input.sourceUrl,
        persisted,
    };
    await withAddressSearchDb((db) => idbPut(db, DATASETS_STORE, record));
    return record;
}

export function setEnabled(datasetId: string, enabled: boolean): Promise<void> {
    return withAddressSearchDb(async (db) => {
        const record = await idbGet<DatasetRecord>(db, DATASETS_STORE, datasetId);
        if (!record) throw new Error(`dataset not found: ${datasetId}`);
        await idbPut(db, DATASETS_STORE, { ...record, enabled });
    });
}

export function renameDataset(datasetId: string, label: string): Promise<void> {
    return withAddressSearchDb(async (db) => {
        const record = await idbGet<DatasetRecord>(db, DATASETS_STORE, datasetId);
        if (!record) throw new Error(`dataset not found: ${datasetId}`);
        await idbPut(db, DATASETS_STORE, { ...record, label });
    });
}

/** Removes the dataset record and every one of its section records. */
export function removeDataset(datasetId: string): Promise<void> {
    return withAddressSearchDb(async (db) => {
        await idbDeleteRange(db, SECTIONS_STORE, prefixRange(`${datasetId}:`));
        await idbDelete(db, DATASETS_STORE, datasetId);
    });
}
