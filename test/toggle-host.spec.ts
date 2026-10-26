import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
    ADDRESS_SEARCH_BOTTOM_BAR_KEY,
    attachChrome,
    detachChrome,
} from '../lib/toggle-host.ts';

describe('address search chrome', () => {
    it('clears a stale bottom-bar key and mounts the toggle on attach', () => {
        const remove = vi.fn();
        const mountToggle = vi.fn();

        attachChrome({
            bottomBar: {
                remove: (key: string) => {
                    remove(key);
                },
            },
            mountToggle,
        });

        expect(remove).toHaveBeenCalledWith(ADDRESS_SEARCH_BOTTOM_BAR_KEY);
        expect(mountToggle).toHaveBeenCalledOnce();
    });

    it('unmounts the toggle and clears a stale bottom-bar key on detach', () => {
        const remove = vi.fn();
        const unmountToggle = vi.fn();

        detachChrome({
            bottomBar: {
                remove: (key: string) => {
                    remove(key);
                },
            },
            unmountToggle,
        });

        expect(unmountToggle).toHaveBeenCalledOnce();
        expect(remove).toHaveBeenCalledWith(ADDRESS_SEARCH_BOTTOM_BAR_KEY);
    });

    it('keeps index.ts from calling bottomBar.add', () => {
        const src = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
        expect(src).not.toMatch(/bottomBar\.add/);
    });
});
