/**
 * Packs baked into a CloudTAK image via app/public/address-search/. Vite copies that
 * directory into dist/ at build time; this module fetches the index the operator script writes
 * and loads any pack this browser does not already have. No CloudTAK imports — callers pass
 * resolveUrl (production uses stdurl via lib/core-bridge.ts).
 */
import { listDatasets } from "./dataset-store.ts";
import { loadFromUrl, type UploadProgress } from "./upload.ts";

export const BUNDLED_PACK_INDEX_PATH = "/address-search/index.json";

export function bundledPackPath(fileName: string): string {
    return `/address-search/${encodeURIComponent(fileName)}`;
}

/** Index entries are bare file names. Reject anything that could escape the directory. */
export function isSafePackFileName(name: string): boolean {
    if (!name.toLowerCase().endsWith(".pack")) return false;
    if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
    return true;
}

export interface BundledSyncProgress {
    file: string;
    sectionsDone: number;
    sectionsTotal: number;
}

export interface BundledSyncFailure {
    url: string;
    message: string;
}

export interface BundledSyncResult {
    loaded: string[];
    skipped: string[];
    failed: BundledSyncFailure[];
    /** True when there is no index (404, HTML SPA fallback, or an unreadable body). */
    absent: boolean;
}

export interface SyncBundledPacksOptions {
    /** Turn a site path (`/address-search/...`) into the URL stored as `sourceUrl`. */
    resolveUrl: (path: string) => string;
    fetchImpl?: typeof fetch;
    onProgress?: (progress: BundledSyncProgress) => void;
    onLoaded?: () => void | Promise<void>;
}

function indexIsAbsent(status: number, text: string): boolean {
    if (status === 404) return true;
    if (text.trimStart().startsWith("<")) return true;
    return false;
}

function parseIndexFiles(text: string): string[] | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return undefined;
    }
    if (typeof parsed !== "object" || parsed === null || !("files" in parsed)) return undefined;
    const files = (parsed as { files: unknown }).files;
    if (!Array.isArray(files) || !files.every((file) => typeof file === "string")) return undefined;
    return files;
}

/**
 * Load every indexed pack that is not already stored under the same source URL. A missing index
 * is a no-op. One bad pack is recorded and skipped so the rest still load.
 */
export async function syncBundledPacks(opts: SyncBundledPacksOptions): Promise<BundledSyncResult> {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const indexUrl = opts.resolveUrl(BUNDLED_PACK_INDEX_PATH);
    const empty: BundledSyncResult = { loaded: [], skipped: [], failed: [], absent: true };

    let res: Response;
    try {
        res = await fetchImpl(indexUrl, { cache: "no-store" });
    } catch (err) {
        console.warn("[address-search] bundled pack index fetch failed", err);
        return empty;
    }

    const text = await res.text();
    if (indexIsAbsent(res.status, text) || !res.ok) {
        if (!res.ok && res.status !== 404 && !text.trimStart().startsWith("<")) {
            console.warn(`[address-search] bundled pack index HTTP ${res.status}`);
        }
        return empty;
    }

    const files = parseIndexFiles(text);
    if (!files) {
        console.warn("[address-search] bundled pack index is not { files: string[] }");
        return empty;
    }

    const existing = await listDatasets();
    const have = new Set(existing.map((dataset) => dataset.sourceUrl).filter((url): url is string => !!url));
    const loaded: string[] = [];
    const skipped: string[] = [];
    const failed: BundledSyncFailure[] = [];

    for (const name of files) {
        if (!isSafePackFileName(name)) {
            console.warn(`[address-search] skipping bundled pack with an unsafe name: ${name}`);
            continue;
        }
        const url = opts.resolveUrl(bundledPackPath(name));
        if (have.has(url)) {
            skipped.push(url);
            continue;
        }
        opts.onProgress?.({ file: name, sectionsDone: 0, sectionsTotal: 0 });
        try {
            await loadFromUrl(url, {
                enabled: true,
                onProgress: (progress: UploadProgress) => {
                    opts.onProgress?.({
                        file: name,
                        sectionsDone: progress.sectionsDone,
                        sectionsTotal: progress.sectionsTotal,
                    });
                },
            });
            have.add(url);
            loaded.push(url);
            await opts.onLoaded?.();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[address-search] failed to load bundled pack ${url}`, err);
            failed.push({ url, message });
        }
    }

    return { loaded, skipped, failed, absent: false };
}
