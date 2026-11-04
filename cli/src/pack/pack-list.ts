/**
 * Builds the `packs.json` list the plugin's managed-pack sync reads (lib/managed-packs.ts):
 * one entry per .pack file, `id` = file name without `.pack`, `url` = the bare file name (so the
 * list must sit in the same folder as the packs), `version` = SHA-256 of the file, so a rebuilt
 * pack is picked up and an unchanged one is not re-downloaded.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface PackListEntry {
    id: string;
    label: string;
    url: string;
    version: string;
    bytes: number;
}

export async function buildPackList(files: string[], labels: Record<string, string> = {}): Promise<{ packs: PackListEntry[] }> {
    const packs: PackListEntry[] = [];
    for (const file of files) {
        const name = path.basename(file);
        if (!name.endsWith(".pack")) throw new Error(`not a .pack file: ${file}`);
        const id = name.slice(0, -".pack".length);
        if (packs.some((p) => p.id === id)) throw new Error(`duplicate pack name: ${name}`);
        const bytes = await readFile(file);
        packs.push({
            id,
            label: labels[id] ?? id,
            url: name,
            version: createHash("sha256").update(bytes).digest("hex"),
            bytes: bytes.length,
        });
    }
    return { packs };
}

/** Parses repeated `--label id=Text` options. */
export function parseLabels(values: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const v of values) {
        const i = v.indexOf("=");
        if (i <= 0 || !v.slice(i + 1).trim()) throw new Error(`--label must look like id=Text, got: ${v}`);
        out[v.slice(0, i).trim()] = v.slice(i + 1).trim();
    }
    return out;
}
