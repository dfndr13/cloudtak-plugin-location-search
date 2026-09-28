export function isBundledPackHeader(bytes: Uint8Array | undefined): boolean;

export function resolveWebRoot(opts: {
    argv?: string[];
    env?: Record<string, string | undefined>;
    scriptDir: string;
    homedir: string;
}): string;

export function writePublicPackIndex(
    webRoot: string,
    opts?: { warn?: (message: string) => void },
): Promise<{ dir: string; indexPath: string; files: string[] }>;
