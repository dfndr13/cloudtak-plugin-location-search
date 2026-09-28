import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPack } from "../cli/src/pack/build.ts";
import { syncBundledPacks } from "../lib/storage/bundled-packs.ts";
import { listDatasets } from "../lib/storage/dataset-store.ts";
import { loadFromUrl } from "../lib/storage/upload.ts";
import { resetAddressSearchDb } from "./storage-test-helpers.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "../cli/fixtures/sample-county.ndjson");
const ORIGIN = "https://example.test";

let pack: Uint8Array;

function bodyInit(u: Uint8Array): BodyInit {
    return u as unknown as BodyInit;
}

function resolveUrl(packPath: string): string {
    return `${ORIGIN}${packPath}`;
}

function packResponse(_url: string, init?: RequestInit): Response {
    const range = (init?.headers as Record<string, string> | undefined)?.["Range"] ?? "";
    const match = /bytes=(\d+)-(\d+)/.exec(range);
    const [start, end] = match ? [Number(match[1]), Number(match[2])] : [0, pack.length - 1];
    return new Response(bodyInit(pack.slice(start, end + 1)), { status: match ? 206 : 200 });
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

describe("syncBundledPacks", () => {
    it("ignores a missing index", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("missing", { status: 404 })));
        const result = await syncBundledPacks({ resolveUrl });
        expect(result.absent).toBe(true);
        expect(result.loaded).toEqual([]);
        expect(await listDatasets()).toHaveLength(0);
    });

    it("ignores an HTML body served in place of the index", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("<!doctype html><html></html>", { status: 200 })));
        const result = await syncBundledPacks({ resolveUrl });
        expect(result.absent).toBe(true);
        expect(await listDatasets()).toHaveLength(0);
    });

    it("loads a pack that is not already stored and enables it", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init?: RequestInit) => {
                if (String(url).endsWith("/address-search/index.json")) {
                    return new Response(JSON.stringify({ files: ["county.pack"] }), { status: 200 });
                }
                return packResponse(String(url), init);
            }),
        );

        const result = await syncBundledPacks({ resolveUrl });
        expect(result.absent).toBe(false);
        expect(result.loaded).toEqual([`${ORIGIN}/address-search/county.pack`]);

        const datasets = await listDatasets();
        expect(datasets).toHaveLength(1);
        expect(datasets[0]?.enabled).toBe(true);
        expect(datasets[0]?.sourceUrl).toBe(`${ORIGIN}/address-search/county.pack`);
        expect(datasets[0]?.region).toBe("TEST");
    });

    it("skips a pack already stored at the same source URL", async () => {
        const url = `${ORIGIN}/address-search/county.pack`;
        vi.stubGlobal("fetch", vi.fn(async (href: string, init?: RequestInit) => packResponse(String(href), init)));
        await loadFromUrl(url);

        let packFetches = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (href: string, init?: RequestInit) => {
                if (String(href).endsWith("/address-search/index.json")) {
                    return new Response(JSON.stringify({ files: ["county.pack"] }), { status: 200 });
                }
                packFetches += 1;
                return packResponse(String(href), init);
            }),
        );

        const result = await syncBundledPacks({ resolveUrl });
        expect(result.skipped).toEqual([url]);
        expect(result.loaded).toEqual([]);
        expect(packFetches).toBe(0);
        expect(await listDatasets()).toHaveLength(1);
    });
});
