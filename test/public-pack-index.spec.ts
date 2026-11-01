import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    isBundledPackHeader,
    resolveWebRoot,
    writePublicPackIndex,
} from "../scripts/write-public-pack-index.mjs";

const dirs: string[] = [];

afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function header(version: number): Uint8Array {
    const bytes = new Uint8Array(8);
    bytes.set([0x43, 0x54, 0x41, 0x53]); // CTAS
    new DataView(bytes.buffer).setUint32(4, version, true);
    return bytes;
}

describe("isBundledPackHeader", () => {
    it("accepts address and gazetteer versions", () => {
        expect(isBundledPackHeader(header(1))).toBe(true);
        expect(isBundledPackHeader(header(2))).toBe(true);
    });

    it("rejects a short buffer, a bad magic, and an unknown version", () => {
        expect(isBundledPackHeader(header(1).subarray(0, 7))).toBe(false);
        const badMagic = header(1);
        badMagic[0] = 0;
        expect(isBundledPackHeader(badMagic)).toBe(false);
        expect(isBundledPackHeader(header(3))).toBe(false);
        expect(isBundledPackHeader(undefined)).toBe(false);
    });
});

describe("resolveWebRoot", () => {
    it("prefers --web, then CLOUDTAK_WEB, then a plugins/address-search checkout, then ~/CloudTAK", () => {
        const scriptDir = "/opt/cloudtak/app/plugins/address-search/scripts";
        expect(resolveWebRoot({
            argv: ["--web", "/srv/web"],
            env: { CLOUDTAK_WEB: "/ignored" },
            scriptDir,
            homedir: "/home/etl",
        })).toBe("/srv/web");
        expect(resolveWebRoot({
            argv: [],
            env: { CLOUDTAK_WEB: "/from/env" },
            scriptDir: "/dev/cloudtak-plugin-address-search/scripts",
            homedir: "/home/etl",
        })).toBe("/from/env");
        expect(resolveWebRoot({
            argv: [],
            env: {},
            scriptDir,
            homedir: "/home/etl",
        })).toBe("/opt/cloudtak/app");
        expect(resolveWebRoot({
            argv: [],
            env: {},
            scriptDir: "/dev/cloudtak-plugin-address-search/scripts",
            homedir: "/home/etl",
        })).toBe(path.join("/home/etl", "CloudTAK", "app"));
    });

    it("rejects --web with no path", () => {
        expect(() => resolveWebRoot({
            argv: ["--web"],
            scriptDir: "/dev/scripts",
            homedir: "/home/etl",
        })).toThrow(/--web/);
    });
});

describe("writePublicPackIndex", () => {
    it("writes a sorted index and skips files that are not CTAS v1 or v2 packs", async () => {
        const webRoot = await mkdtemp(path.join(tmpdir(), "address-search-index-"));
        dirs.push(webRoot);
        const dir = path.join(webRoot, "public", "address-search");
        const warnings: string[] = [];
        await mkdir(dir, { recursive: true });

        await writeFile(path.join(dir, "b.pack"), header(2));
        await writeFile(path.join(dir, "a.pack"), header(1));
        await writeFile(path.join(dir, "notes.txt"), header(1));
        await writeFile(path.join(dir, "bad.pack"), new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
        await writeFile(path.join(dir, "foo..bar.pack"), header(1));

        const result = await writePublicPackIndex(webRoot, { warn: (message: string) => warnings.push(message) });

        expect(result.files).toEqual(["a.pack", "b.pack"]);
        expect(JSON.parse(await readFile(result.indexPath, "utf8"))).toEqual({ files: ["a.pack", "b.pack"] });
        expect(warnings.some((line) => line.includes("bad.pack"))).toBe(true);
        expect(warnings.some((line) => line.includes("foo..bar.pack"))).toBe(true);
    });

    it("writes an empty file list when the directory has no packs", async () => {
        const webRoot = await mkdtemp(path.join(tmpdir(), "address-search-empty-"));
        dirs.push(webRoot);
        const result = await writePublicPackIndex(webRoot);
        expect(result.files).toEqual([]);
        expect(JSON.parse(await readFile(result.indexPath, "utf8"))).toEqual({ files: [] });
    });
});
