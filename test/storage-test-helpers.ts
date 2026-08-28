import { DB_NAME } from "../lib/storage/schema.ts";

/** Ensures each test starts from a clean IndexedDB, since fake-indexeddb persists across tests within one file. */
export function resetAddressSearchDb(): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error("could not reset test database"));
        req.onblocked = () => resolve(); // no open connections in these tests; shouldn't happen
    });
}
