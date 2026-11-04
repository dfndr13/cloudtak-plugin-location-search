import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildPackList, parseLabels } from "../src/pack/pack-list.ts";

describe("buildPackList", () => {
    it("lists each pack with id, relative url, sha256 version, size and label", async () => {
        const dir = await mkdtemp(path.join(tmpdir(), "packlist-"));
        await writeFile(path.join(dir, "state-addresses.pack"), "abc");
        await writeFile(path.join(dir, "state-places.pack"), "defg");
        const list = await buildPackList(
            [path.join(dir, "state-addresses.pack"), path.join(dir, "state-places.pack")],
            { "state-addresses": "State addresses" },
        );
        expect(list.packs).toEqual([
            { id: "state-addresses", label: "State addresses", url: "state-addresses.pack", version: createHash("sha256").update("abc").digest("hex"), bytes: 3 },
            { id: "state-places", label: "state-places", url: "state-places.pack", version: createHash("sha256").update("defg").digest("hex"), bytes: 4 },
        ]);
    });

    it("rejects non-.pack files and duplicate names", async () => {
        const dir = await mkdtemp(path.join(tmpdir(), "packlist-"));
        await writeFile(path.join(dir, "a.txt"), "x");
        await expect(buildPackList([path.join(dir, "a.txt")])).rejects.toThrow(/not a \.pack/);
        await writeFile(path.join(dir, "a.pack"), "x");
        await expect(buildPackList([path.join(dir, "a.pack"), path.join(dir, "a.pack")])).rejects.toThrow(/duplicate/);
    });
});

describe("parseLabels", () => {
    it("parses id=Text pairs and rejects malformed ones", () => {
        expect(parseLabels(["a=Alpha", "b = Beta = 2"])).toEqual({ a: "Alpha", b: "Beta = 2" });
        expect(() => parseLabels(["nolabel"])).toThrow(/id=Text/);
    });
});
