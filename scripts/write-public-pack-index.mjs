/**
 * Writes CloudTAK/app/public/address-search/index.json listing every valid .pack in that
 * directory. Run this before a CloudTAK rebuild so Vite copies the packs and the index into
 * dist/. The plugin fetches /address-search/index.json and loads each file.
 *
 * Default web root is ~/CloudTAK/app. Override with --web <app> or CLOUDTAK_WEB.
 * When this repo is cloned at app/plugins/address-search, that web root is used instead.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACK_MAGIC = 'CTAS';

/** First 8 bytes: ASCII magic plus little-endian version 1 (address) or 2 (gazetteer). */
export function isBundledPackHeader(bytes) {
    if (!bytes || bytes.length < 8) return false;
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic !== PACK_MAGIC) return false;
    const version = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
    return version === 1 || version === 2;
}

/**
 * @param {{ argv?: string[], env?: Record<string, string | undefined>, scriptDir: string, homedir: string }} opts
 */
export function resolveWebRoot(opts) {
    const argv = opts.argv ?? [];
    const env = opts.env ?? {};
    const webFlag = argv.indexOf('--web');
    if (webFlag !== -1) {
        const value = argv[webFlag + 1];
        if (!value) throw new Error('--web requires a path to CloudTAK app');
        return path.resolve(value);
    }
    if (env.CLOUDTAK_WEB) return path.resolve(env.CLOUDTAK_WEB);

    const repoRoot = path.resolve(opts.scriptDir, '..');
    const parentName = path.basename(path.dirname(repoRoot));
    if (parentName === 'plugins' && path.basename(repoRoot) === 'address-search') {
        return path.resolve(repoRoot, '..', '..');
    }
    return path.join(opts.homedir, 'CloudTAK', 'app');
}

/**
 * @param {string} webRoot CloudTAK app directory
 * @param {{ warn?: (message: string) => void }} [opts]
 */
export async function writePublicPackIndex(webRoot, opts = {}) {
    const warn = opts.warn ?? ((message) => console.warn(message));
    const dir = path.join(webRoot, 'public', 'address-search');
    await fs.mkdir(dir, { recursive: true });

    const names = await fs.readdir(dir);
    const files = [];
    for (const name of names) {
        if (!name.toLowerCase().endsWith('.pack')) continue;
        if (name.includes('/') || name.includes('\\') || name.includes('..')) {
            warn(`skip ${name}: invalid name`);
            continue;
        }
        const full = path.join(dir, name);
        const stat = await fs.stat(full);
        if (!stat.isFile()) continue;

        const handle = await fs.open(full, 'r');
        try {
            const buf = new Uint8Array(8);
            const { bytesRead } = await handle.read(buf, 0, 8, 0);
            if (!isBundledPackHeader(buf.subarray(0, bytesRead))) {
                warn(`skip ${name}: not a CTAS v1 or v2 pack`);
                continue;
            }
        } finally {
            await handle.close();
        }
        files.push(name);
    }

    files.sort();
    const indexPath = path.join(dir, 'index.json');
    await fs.writeFile(indexPath, `${JSON.stringify({ files }, null, 2)}\n`);
    return { dir, indexPath, files };
}

function isDirectRun() {
    const argv1 = globalThis.process?.argv?.[1];
    if (!argv1) return false;
    return path.resolve(argv1) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
    try {
        const webRoot = resolveWebRoot({
            argv: globalThis.process.argv.slice(2),
            env: globalThis.process.env,
            scriptDir: path.dirname(fileURLToPath(import.meta.url)),
            homedir: os.homedir(),
        });
        const { files, indexPath } = await writePublicPackIndex(webRoot);
        console.log(`wrote ${files.length} pack(s) to ${indexPath}`);
    } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        globalThis.process.exitCode = 1;
    }
}
