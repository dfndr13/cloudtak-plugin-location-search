import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, beforeEach, beforeAll, vi, afterEach } from "vitest";
import { buildPack } from "../cli/src/pack/build.ts";
import { loadFromUrl } from "../lib/storage/upload.ts";
import { listDatasets, setEnabled } from "../lib/storage/dataset-store.ts";
import { idbGetAll } from "../lib/storage/idb.ts";
import { withAddressSearchDb, SECTIONS_STORE } from "../lib/storage/schema.ts";
import { parsePackList, planSync, syncManagedPacks } from "../lib/managed-packs.ts";
import { resetAddressSearchDb } from "./storage-test-helpers.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "../cli/fixtures/sample-county.ndjson");
const LIST_URL = "https://cloud.example.test/address-packs/packs.json";

let pack: Uint8Array;

function bodyInit(u: Uint8Array): BodyInit {
    return u as unknown as BodyInit;
}

/** A tiny fake server: `list` is what packs.json returns (object → JSON, string → raw body,
 *  number → that HTTP status); every other URL serves `pack` with Range support, except URLs in
 *  `broken`, which return 500. */
function serve(list: unknown, broken: string[] = []): string[] {
    const packHits: string[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
            if (url === LIST_URL) {
                if (typeof list === "number") return new Response("", { status: list });
                return new Response(typeof list === "string" ? list : JSON.stringify(list), { status: 200 });
            }
            if (broken.includes(url)) return new Response("", { status: 500 });
            packHits.push(url);
            const range = (init?.headers as Record<string, string>)?.["Range"] ?? "";
            const match = /bytes=(\d+)-(\d+)/.exec(range);
            const [start, end] = match ? [Number(match[1]), Number(match[2])] : [0, pack.length - 1];
            return new Response(bodyInit(pack.slice(start, end + 1)), { status: 206 });
        }),
    );
    return packHits;
}

const list = (...packs: { id: string; version: string; label?: string }[]) => ({
    packs: packs.map((p) => ({ id: p.id, label: p.label ?? p.id.toUpperCase(), url: `${p.id}.pack`, version: p.version })),
});

async function sectionCount(): Promise<number> {
    return withAddressSearchDb(async (db) => (await idbGetAll(db, SECTIONS_STORE)).length);
}

beforeAll(async () => {
    const built = await buildPack({ inputFiles: [FIXTURE], region: "TEST" });
    pack = new Uint8Array(built.pack);
});

beforeEach(async () => {
    await resetAddressSearchDb();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("parsePackList", () => {
    it("resolves relative urls against the list url", () => {
        const packs = parsePackList(list({ id: "ks", version: "v1" }), LIST_URL);
        expect(packs[0]!.url).toBe("https://cloud.example.test/address-packs/ks.pack");
    });

    it("rejects missing fields, duplicates and non-lists", () => {
        expect(() => parsePackList({}, LIST_URL)).toThrow(/packs/);
        expect(() => parsePackList({ packs: [{ id: "a", label: "A", url: "a.pack" }] }, LIST_URL)).toThrow(/version/);
        expect(() => parsePackList(list({ id: "a", version: "1" }, { id: "a", version: "2" }), LIST_URL)).toThrow(/duplicate/);
    });
});

describe("planSync", () => {
    it("ignores hand-loaded datasets", () => {
        const manual = { datasetId: "m", sourceUrl: "x" } as never;
        expect(planSync([], [manual])).toEqual({ install: [], remove: [] });
    });
});

describe("syncManagedPacks", () => {
    it("installs every listed pack, all enabled, labelled from the list", async () => {
        serve(list({ id: "addr", version: "v1", label: "Addresses" }, { id: "places", version: "v1", label: "Places" }));
        const result = await syncManagedPacks({ listUrl: LIST_URL });
        expect(result).toMatchObject({ status: "ok", installed: ["addr", "places"], failed: [] });
        const ds = await listDatasets();
        expect(ds.map((d) => [d.label, d.managedPackId, d.managedVersion, d.enabled]).sort()).toEqual([
            ["Addresses", "addr", "v1", true],
            ["Places", "places", "v1", true],
        ]);
    });

    it("does nothing when everything is current", async () => {
        serve(list({ id: "addr", version: "v1" }));
        await syncManagedPacks({ listUrl: LIST_URL });
        const hits = serve(list({ id: "addr", version: "v1" }));
        const result = await syncManagedPacks({ listUrl: LIST_URL });
        expect(result).toMatchObject({ status: "ok", installed: [], removed: [] });
        expect(hits).toHaveLength(0);
    });

    it("replaces a pack whose version changed, keeping the user's off switch", async () => {
        serve(list({ id: "addr", version: "v1" }));
        await syncManagedPacks({ listUrl: LIST_URL });
        const [old] = await listDatasets();
        await setEnabled(old!.datasetId, false);

        serve(list({ id: "addr", version: "v2" }));
        const result = await syncManagedPacks({ listUrl: LIST_URL });
        expect(result).toMatchObject({ status: "ok", installed: ["addr"], removed: [old!.datasetId] });
        const ds = await listDatasets();
        expect(ds).toHaveLength(1);
        expect(ds[0]).toMatchObject({ managedVersion: "v2", enabled: false });
    });

    it("removes a managed pack that left the list, never a hand-loaded one", async () => {
        serve(list({ id: "addr", version: "v1" }, { id: "gone", version: "v1" }));
        await syncManagedPacks({ listUrl: LIST_URL });
        await loadFromUrl("https://elsewhere.example.test/manual.pack");

        serve(list({ id: "addr", version: "v1" }));
        await syncManagedPacks({ listUrl: LIST_URL });
        const ds = await listDatasets();
        expect(ds.map((d) => d.managedPackId ?? "manual").sort()).toEqual(["addr", "manual"]);
    });

    it("re-installs after storage is wiped", async () => {
        serve(list({ id: "addr", version: "v1" }));
        await syncManagedPacks({ listUrl: LIST_URL });
        await resetAddressSearchDb();
        await syncManagedPacks({ listUrl: LIST_URL });
        expect(await listDatasets()).toHaveLength(1);
    });

    it.each([
        ["an HTTP error", 404],
        ["the app page instead of JSON", "<!doctype html><html></html>"],
        ["an empty object", {}],
    ])("changes nothing when the list is %s", async (_name, body) => {
        serve(list({ id: "addr", version: "v1" }));
        await syncManagedPacks({ listUrl: LIST_URL });
        serve(body);
        const result = await syncManagedPacks({ listUrl: LIST_URL });
        expect(result.status).toBe("unavailable");
        expect(await listDatasets()).toHaveLength(1);
    });

    it("keeps the old copy and leaves no orphan sections when an update download fails", async () => {
        serve(list({ id: "addr", version: "v1" }));
        await syncManagedPacks({ listUrl: LIST_URL });
        const before = await sectionCount();

        // Header + manifest succeed, then the server starts failing mid-download.
        let calls = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init?: RequestInit) => {
                if (url === LIST_URL) return new Response(JSON.stringify(list({ id: "addr", version: "v2" })), { status: 200 });
                if (++calls > 3) return new Response("", { status: 503 });
                const m = /bytes=(\d+)-(\d+)/.exec((init?.headers as Record<string, string>)?.["Range"] ?? "")!;
                return new Response(bodyInit(pack.slice(Number(m[1]), Number(m[2]) + 1)), { status: 206 });
            }),
        );
        const result = await syncManagedPacks({ listUrl: LIST_URL });
        expect(result).toMatchObject({ status: "ok", installed: [], failed: [{ id: "addr" }] });
        const ds = await listDatasets();
        expect(ds).toHaveLength(1);
        expect(ds[0]!.managedVersion).toBe("v1");
        expect(await sectionCount()).toBe(before);
    });

    it("tidies a duplicate copy left at the current version", async () => {
        serve(list({ id: "addr", version: "v1" }));
        await syncManagedPacks({ listUrl: LIST_URL });
        await loadFromUrl("https://cloud.example.test/address-packs/addr.pack", { managed: { id: "addr", version: "v1" } });
        expect(await listDatasets()).toHaveLength(2);
        await syncManagedPacks({ listUrl: LIST_URL });
        expect(await listDatasets()).toHaveLength(1);
    });
});
