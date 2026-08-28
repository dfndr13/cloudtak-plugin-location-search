#!/usr/bin/env node
/**
 * Phase 2's actual deliverable (PLAN.md §7): prove the search core hits its latency targets
 * against a real pack, with no UI and no CloudTAK involved. Targets from PLAN.md §4.1: <10ms for
 * the prefix path, <50ms with fuzzy engaged, on a mid-range phone — this machine will be faster,
 * but the relative headroom is still the signal that matters before any UI gets built on top.
 */
import { openNodeFilePackSource } from "../lib/pack/pack-source.ts";
import { getSection, gunzip } from "../lib/pack/container.ts";
import { decodeStringTable } from "../lib/pack/strings.ts";
import { decodeGroups } from "../lib/pack/groups.ts";
import { decodeChunkRows } from "../lib/pack/chunks.ts";
import { SearchIndex } from "../lib/search/search-index.ts";
import type { DecodedGroup } from "../lib/pack/types.ts";

const PREFIX_TARGET_MS = 10;
const FUZZY_TARGET_MS = 50;
const SAMPLE_QUERIES_PER_CATEGORY = 300;

interface SampledAddress {
    number: number;
    streetDisplay: string;
    city: string;
    lat: number;
    lon: number;
}

function percentile(sortedMs: readonly number[], p: number): number {
    if (sortedMs.length === 0) return NaN;
    const idx = Math.min(sortedMs.length - 1, Math.floor((p / 100) * sortedMs.length));
    return sortedMs[idx]!;
}

function mutateTypo(word: string): string {
    if (word.length < 2) return word + "X";
    const i = Math.floor(Math.random() * (word.length - 1));
    const chars = [...word];
    // Adjacent transposition — the case PLAN.md specifically calls out ("Mian Steet").
    [chars[i], chars[i + 1]] = [chars[i + 1]!, chars[i]!];
    return chars.join("");
}

async function sampleAddresses(packPath: string, count: number): Promise<SampledAddress[]> {
    const source = await openNodeFilePackSource(packPath);
    const manifest = await source.manifest();
    const streetsDisplay = decodeStringTable(await source.readSection("streetsDisplay"));
    const places = decodeStringTable(await source.readSection("places"));
    const groups: DecodedGroup[] = decodeGroups(
        await source.readSection("groups"),
        getSection(manifest, "groups").count!,
    );

    const chunkCount = manifest.sections.filter((s) => s.id.startsWith("chunk:")).length;
    const samples: SampledAddress[] = [];
    const groupStep = Math.max(1, Math.floor(groups.length / count));

    for (let gi = 0; gi < groups.length && samples.length < count; gi += groupStep) {
        const group = groups[gi]!;
        if (group.chunkId >= chunkCount) continue;
        const chunkSection = getSection(manifest, `chunk:${group.chunkId}`);
        const compressed = await source.readSection(chunkSection.id);
        const raw = chunkSection.compressed ? await gunzip(compressed) : compressed;
        const rows = decodeChunkRows(raw, chunkSection.count!);
        const row = rows[group.rowOffset]!;

        samples.push({
            number: row.number,
            streetDisplay: streetsDisplay[group.streetId]!,
            city: places[group.placeId] ?? "",
            lat: group.centroidLatE7 / 1e7 + row.latD / 1e7,
            lon: group.centroidLonE7 / 1e7 + row.lonD / 1e7,
        });
    }
    return samples;
}

async function main() {
    const packPath = process.argv[2] ?? "cli/output/az-statewide.pack";
    console.log(`Loading ${packPath} ...`);
    const openStart = performance.now();
    const source = await openNodeFilePackSource(packPath);
    const index = await SearchIndex.open(source);
    console.log(`  opened in ${(performance.now() - openStart).toFixed(1)}ms\n`);

    const samples = await sampleAddresses(packPath, SAMPLE_QUERIES_PER_CATEGORY);
    console.log(`Sampled ${samples.length} real addresses to build queries from.\n`);

    const reference = { lat: samples[0]!.lat, lon: samples[0]!.lon };

    const exactQueries = samples.map((s) => `${s.number} ${s.streetDisplay}`);
    const prefixQueries = samples.map((s) => `${s.number} ${s.streetDisplay.slice(0, Math.max(2, s.streetDisplay.length - 3))}`);
    const typoQueries = samples.map((s) => {
        const words = s.streetDisplay.split(" ");
        const idx = words.findIndex((w) => w.length >= 3);
        if (idx >= 0) words[idx] = mutateTypo(words[idx]!);
        return `${s.number} ${words.join(" ")}`;
    });

    async function bench(label: string, queries: readonly string[], targetMs: number, expectVia?: string) {
        const timings: number[] = [];
        let matched = 0;
        const matchedVia: Record<string, number> = {};

        for (const q of queries) {
            const start = performance.now();
            const results = await index.search(q, { reference, limit: 5 });
            timings.push(performance.now() - start);
            if (results.length > 0) {
                matched++;
                const via = results[0]!.matchedVia;
                matchedVia[via] = (matchedVia[via] ?? 0) + 1;
            }
        }
        timings.sort((a, b) => a - b);

        const p50 = percentile(timings, 50);
        const p95 = percentile(timings, 95);
        const p99 = percentile(timings, 99);
        const pass = p95 <= targetMs;

        console.log(`-- ${label} (${queries.length} queries) --`);
        console.log(`  matched: ${matched}/${queries.length} (${matchedVia["exact"] ?? 0} exact, ${matchedVia["prefix"] ?? 0} prefix, ${matchedVia["fuzzy"] ?? 0} fuzzy)`);
        console.log(`  p50=${p50.toFixed(2)}ms  p95=${p95.toFixed(2)}ms  p99=${p99.toFixed(2)}ms  max=${timings[timings.length - 1]!.toFixed(2)}ms`);
        console.log(`  target: p95 <= ${targetMs}ms -> ${pass ? "PASS" : "FAIL"}`);
        if (expectVia) {
            const expectedCount = matchedVia[expectVia] ?? 0;
            console.log(`  expected matchedVia="${expectVia}": ${expectedCount}/${matched} of matches`);
        }
        console.log();
        return pass;
    }

    const results = [
        await bench("Exact queries (real number + real street)", exactQueries, PREFIX_TARGET_MS, "exact"),
        await bench("Prefix queries (truncated street name)", prefixQueries, PREFIX_TARGET_MS, "prefix"),
        await bench("Typo queries (adjacent-transposition, forces fuzzy path)", typoQueries, FUZZY_TARGET_MS, "fuzzy"),
    ];

    console.log(results.every(Boolean) ? "ALL TARGETS MET" : "SOME TARGETS MISSED");
    process.exitCode = results.every(Boolean) ? 0 : 1;
}

main();
