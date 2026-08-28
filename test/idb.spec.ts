import { describe, expect, it, beforeEach } from "vitest";
import { openDatabase, idbGet, idbGetAll, idbPut, idbDelete, idbDeleteRange, prefixRange } from "../lib/storage/idb.ts";
import { resetAddressSearchDb } from "./storage-test-helpers.ts";

const STORE = "items";
let dbCounter = 0;

// A uniquely-named database per call, rather than delete-and-recreate one shared name: deleting a
// database blocks until every existing connection to it is closed, and nothing here holds onto
// connections to close them explicitly — unique names sidestep the question entirely.
async function freshDb(): Promise<IDBDatabase> {
    dbCounter += 1;
    return openDatabase(`idb-test-db-fresh-${dbCounter}`, 1, (db) => {
        db.createObjectStore(STORE, { keyPath: "id" });
    });
}

beforeEach(async () => {
    await resetAddressSearchDb();
});

describe("idb wrapper", () => {
    it("put then get round-trips a value", async () => {
        const db = await freshDb();
        await idbPut(db, STORE, { id: "a", value: 1 });
        expect(await idbGet(db, STORE, "a")).toEqual({ id: "a", value: 1 });
    });

    it("get returns undefined for a missing key", async () => {
        const db = await freshDb();
        expect(await idbGet(db, STORE, "missing")).toBeUndefined();
    });

    it("getAll returns every record", async () => {
        const db = await freshDb();
        await idbPut(db, STORE, { id: "a", value: 1 });
        await idbPut(db, STORE, { id: "b", value: 2 });
        const all = await idbGetAll(db, STORE);
        expect(all).toHaveLength(2);
    });

    it("delete removes a single record", async () => {
        const db = await freshDb();
        await idbPut(db, STORE, { id: "a", value: 1 });
        await idbDelete(db, STORE, "a");
        expect(await idbGet(db, STORE, "a")).toBeUndefined();
    });

    it("supports an out-of-line key via put's key argument", async () => {
        const db = await openDatabase("idb-test-db-2", 1, (d) => d.createObjectStore("bytes"));
        const bytes = new Uint8Array([1, 2, 3]);
        await idbPut(db, "bytes", bytes, "ds1:section-a");
        expect(await idbGet<Uint8Array>(db, "bytes", "ds1:section-a")).toEqual(bytes);
    });
});

describe("prefixRange / idbDeleteRange", () => {
    it("deletes only keys matching the given prefix", async () => {
        const db = await openDatabase("idb-test-db-3", 1, (d) => d.createObjectStore("bytes"));
        await idbPut(db, "bytes", new Uint8Array([1]), "ds1:a");
        await idbPut(db, "bytes", new Uint8Array([2]), "ds1:b");
        await idbPut(db, "bytes", new Uint8Array([3]), "ds2:a");

        await idbDeleteRange(db, "bytes", prefixRange("ds1:"));

        expect(await idbGet(db, "bytes", "ds1:a")).toBeUndefined();
        expect(await idbGet(db, "bytes", "ds1:b")).toBeUndefined();
        expect(await idbGet(db, "bytes", "ds2:a")).toEqual(new Uint8Array([3]));
    });
});
