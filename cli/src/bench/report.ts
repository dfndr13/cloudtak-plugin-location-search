import type { BuildStats } from "../pack/build.ts";
import type { GazetteerBuildStats } from "../pack/gazetteer.ts";

function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtMs(n: number): string {
    return `${n.toFixed(1)} ms`;
}

export function printReport(stats: BuildStats): void {
    console.log("=== Address pack build report ===");
    console.log(`raw features:      ${stats.rawFeatureCount}`);
    console.log(`dropped (no geo/street/number): ${stats.droppedCount}`);
    console.log(`deduped:           ${stats.dedupedCount}`);
    console.log(`addresses:         ${stats.addressCount}`);
    console.log(`streets:           ${stats.streetCount}`);
    console.log(`places:            ${stats.placeCount}`);
    console.log(`groups:            ${stats.groupCount}`);
    console.log(`chunks:            ${stats.chunkCount}`);
    console.log(`occupied cells:    ${stats.cellCount}`);
    console.log(`trigrams:          ${stats.trigramCount}`);
    console.log();
    console.log("-- timings --");
    for (const [label, ms] of Object.entries(stats.timings)) {
        console.log(`${label.padEnd(12)} ${fmtMs(ms)}`);
    }
    console.log();
    console.log("-- section sizes --");
    const chunkSizes = stats.sectionSizes.filter((s) => s.id.startsWith("chunk:"));
    const nonChunk = stats.sectionSizes.filter((s) => !s.id.startsWith("chunk:"));
    for (const s of nonChunk) {
        console.log(`${s.id.padEnd(16)} ${fmtBytes(s.byteLength).padStart(10)}${s.compressed ? "  (gzip)" : ""}`);
    }
    if (chunkSizes.length > 0) {
        const totalChunkBytes = chunkSizes.reduce((sum, s) => sum + s.byteLength, 0);
        console.log(`chunks (${chunkSizes.length})`.padEnd(16) + ` ${fmtBytes(totalChunkBytes).padStart(10)}  (gzip, total)`);
    }
    console.log();
    console.log(`total pack size:   ${fmtBytes(stats.totalByteLength)}`);
}

export function printGazetteerReport(stats: GazetteerBuildStats): void {
    console.log("=== Gazetteer pack build report ===");
    console.log(`raw features:      ${stats.rawFeatureCount}`);
    console.log(`filtered (class):  ${stats.filteredCount}`);
    console.log(`dropped (blank name/class/coords): ${stats.droppedCount}`);
    console.log(`deduped:           ${stats.dedupedCount}`);
    console.log(`records:           ${stats.recordCount}`);
    console.log(`distinct names:    ${stats.nameCount}`);
    console.log(`classes:           ${stats.classCount}`);
    console.log(`places:            ${stats.placeCount}`);
    console.log(`chunks:            ${stats.chunkCount}`);
    console.log(`occupied cells:    ${stats.cellCount}`);
    console.log(`trigrams:          ${stats.trigramCount}`);
    console.log();
    console.log("-- timings --");
    for (const [label, ms] of Object.entries(stats.timings)) {
        console.log(`${label.padEnd(14)} ${fmtMs(ms)}`);
    }
    console.log();
    console.log("-- section sizes --");
    const chunkSizes = stats.sectionSizes.filter((s) => s.id.startsWith("gnChunk:"));
    const nonChunk = stats.sectionSizes.filter((s) => !s.id.startsWith("gnChunk:"));
    for (const s of nonChunk) {
        console.log(`${s.id.padEnd(16)} ${fmtBytes(s.byteLength).padStart(10)}${s.compressed ? "  (gzip)" : ""}`);
    }
    if (chunkSizes.length > 0) {
        const totalChunkBytes = chunkSizes.reduce((sum, s) => sum + s.byteLength, 0);
        console.log(`gnChunks (${chunkSizes.length})`.padEnd(16) + ` ${fmtBytes(totalChunkBytes).padStart(10)}  (gzip, total)`);
    }
    console.log();
    console.log(`total pack size:   ${fmtBytes(stats.totalByteLength)}`);
}
