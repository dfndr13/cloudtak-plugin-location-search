import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, beforeEach, beforeAll, vi, afterEach } from "vitest";
import { buildPack } from "../cli/src/pack/build.ts";
import { loadFromFile, loadFromUrl } from "../lib/storage/upload.ts";
import { listDatasets } from "../lib/storage/dataset-store.ts";
import { IndexedDbPackSource } from "../lib/storage/pack-source-idb.ts";
import { resetAddressSearchDb } from "./storage-test-helpers.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "../cli/fixtures/sample-county.ndjson");

let pack: Uint8Array;

// TS 5.7's stricter ArrayBufferLike/ArrayBuffer typing on Uint8Array doesn't line up with
// BlobPart/BodyInit's declared parameter types even though this is exactly what Blob/Response
// accept at runtime — narrow casts confined to this test file's mock plumbing.
function bp(u: Uint8Array): BlobPart {
    return u as unknown as BlobPart;
}
function bodyInit(u: Uint8Array): BodyInit {
    return u as unknown as BodyInit;
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

describe("loadFromFile", () => {
    it("writes every section and creates a dataset record, enabled as the first dataset", async () => {
        const file = new File([bp(pack)], "test.pack");
        const progressCalls: number[] = [];

        const record = await loadFromFile(file, { onProgress: (p) => progressCalls.push(p.sectionsDone) });

        expect(record.region).toBe("TEST");
        expect(record.enabled).toBe(true); // decision #8: default is one enabled, and this is the first
        expect(progressCalls.length).toBeGreaterThan(0);
        expect(progressCalls[progressCalls.length - 1]).toBe(progressCalls.length);

        // Prove the sections actually made it into storage by reading a real one back through
        // the same reader the search worker uses.
        const source = new IndexedDbPackSource(record.datasetId, record.manifest);
        expect((await source.readSection("streets")).length).toBeGreaterThan(0);
    });

    it("does not enable a second dataset by default", async () => {
        await loadFromFile(new File([bp(pack)], "a.pack"));
        const second = await loadFromFile(new File([bp(pack)], "b.pack"));
        expect(second.enabled).toBe(false);
        expect((await listDatasets()).filter((d) => d.enabled)).toHaveLength(1);
    });

    it("enables a later dataset when enabled is set explicitly", async () => {
        await loadFromFile(new File([bp(pack)], "a.pack"));
        const second = await loadFromFile(new File([bp(pack)], "b.pack"), { enabled: true });
        expect(second.enabled).toBe(true);
        expect((await listDatasets()).filter((d) => d.enabled)).toHaveLength(2);
    });

    it("rejects a file with a corrupted section checksum", async () => {
        const corrupted = new Uint8Array(pack);
        // Flip a byte inside the first (non-manifest) section's data.
        const manifestLen = new DataView(corrupted.buffer).getUint32(8, true);
        corrupted[12 + manifestLen] = corrupted[12 + manifestLen]! ^ 0xff;
        await expect(loadFromFile(new File([bp(corrupted)], "bad.pack"))).rejects.toThrow(/checksum/);
    });
});

describe("loadFromUrl", () => {
    it("uses per-section Range requests when the server honors them", async () => {
        const calls: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init?: RequestInit) => {
                const range = (init?.headers as Record<string, string>)?.["Range"] ?? "";
                calls.push(range);
                const match = /bytes=(\d+)-(\d+)/.exec(range);
                const [start, end] = match ? [Number(match[1]), Number(match[2])] : [0, pack.length - 1];
                const body = pack.slice(start, end + 1);
                return new Response(bodyInit(body), { status: 206 });
            }),
        );

        const record = await loadFromUrl("https://example.test/az.pack");
        expect(record.sourceUrl).toBe("https://example.test/az.pack");
        // One request for the header, one for the manifest body, one per section.
        expect(calls.length).toBeGreaterThan(record.manifest.sections.length);
    });

    it("falls back to one full fetch when the server ignores Range", async () => {
        const fetchMock = vi.fn(async () => new Response(bodyInit(pack), { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        const record = await loadFromUrl("https://example.test/az.pack");
        expect(record.region).toBe("TEST");
        // Two logical reads happen (header, then manifest body) before section writes begin, but
        // the full-body cache means the underlying network fetch only fires once.
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("propagates an HTTP error", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
        await expect(loadFromUrl("https://example.test/missing.pack")).rejects.toThrow(/404/);
    });
});
