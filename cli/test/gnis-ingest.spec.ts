import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseGnisFiles, dedupeGazetteerKey, DEFAULT_GAZETTEER_CLASSES } from "../src/ingest/gnis.ts";
import type { NormalizedGazetteerRecord } from "../src/pack/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "../fixtures/sample-gnis.txt");

async function collect(): Promise<{ ok: NormalizedGazetteerRecord[]; dropped: string[] }> {
    const ok: NormalizedGazetteerRecord[] = [];
    const dropped: string[] = [];
    for await (const line of parseGnisFiles([FIXTURE])) {
        if (line.ok) ok.push(line.record);
        else dropped.push(line.reason);
    }
    return { ok, dropped };
}

describe("GNIS ingest", () => {
    it("resolves columns by name (header order is scrambled in the fixture) and reads all 12 rows", async () => {
        const { ok, dropped } = await collect();
        expect(ok.length + dropped.length).toBe(12);
    });

    it("filters Squaw Flat (class not in the default allowlist)", async () => {
        const { ok, dropped } = await collect();
        expect(ok.some((r) => r.nameDisplay === "Squaw Flat")).toBe(false);
        expect(dropped.filter((r) => r === "filtered-class")).toHaveLength(1);
    });

    it("drops exactly the blank-name, blank-class, and blank-coordinate rows", async () => {
        const { dropped } = await collect();
        const nonFiltered = dropped.filter((r) => r !== "filtered-class");
        expect(nonFiltered.sort()).toEqual(["blank-class", "blank-name", "invalid-coordinates"]);
    });

    it("keeps 8 valid, unfiltered rows before dedup (the exact Bear Creek duplicate included)", async () => {
        const { ok } = await collect();
        expect(ok).toHaveLength(8);
    });

    it("folds diacritics into the match-form but preserves them in the display form", async () => {
        const { ok } = await collect();
        const canon = ok.find((r) => r.nameDisplay === "Cañon City");
        expect(canon).toBeDefined();
        expect(canon!.nameMatch).toBe("CANON CITY");

        const pena = ok.find((r) => r.nameDisplay === "Peña Blanca Lake");
        expect(pena!.nameMatch).toBe("PENA BLANCA LAKE");
    });

    it("dedupeGazetteerKey collapses the exact-duplicate Bear Creek rows to the same key", async () => {
        const { ok } = await collect();
        const bearCreeks = ok.filter((r) => r.nameDisplay === "Bear Creek");
        expect(bearCreeks).toHaveLength(2);
        expect(dedupeGazetteerKey(bearCreeks[0]!)).toBe(dedupeGazetteerKey(bearCreeks[1]!));
    });

    it("normalizes county to title case and state to uppercase", async () => {
        const { ok } = await collect();
        const elden = ok.find((r) => r.nameDisplay === "Mount Elden");
        expect(elden!.county).toBe("Coconino");
        expect(elden!.state).toBe("AZ");
    });

    it("the default class allowlist is stored uppercased for case-insensitive comparison", () => {
        expect(DEFAULT_GAZETTEER_CLASSES.has("STREAM")).toBe(true);
        expect(DEFAULT_GAZETTEER_CLASSES.has("FLAT")).toBe(false);
    });

    it("--classes all bypasses the allowlist entirely", async () => {
        const ok: NormalizedGazetteerRecord[] = [];
        for await (const line of parseGnisFiles([FIXTURE], { classes: "all" })) {
            if (line.ok) ok.push(line.record);
        }
        expect(ok.some((r) => r.nameDisplay === "Squaw Flat")).toBe(true);
    });
});
