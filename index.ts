/**
 * CloudTAK Address Search plugin — local-first address search over an OpenAddresses-derived
 * pack, with an optional online fallback. See docs/PLAN.md for the full phased plan; this is
 * Phase 3 (UI + Worker + IndexedDB storage) — Phases 4-6 (map drop-marker, reverse lookup, the
 * cross-plugin sharing contract) are not built yet.
 */
import type { App } from 'vue';
import type { PluginAPI, PluginInstance } from '../../plugin.ts';
import * as state from './lib/state.ts';
import { SearchWorkerClient } from './lib/worker/worker-client.ts';
import AddressSearchToggle from './components/AddressSearchToggle.vue';

const BOTTOM_BAR_KEY = 'address-search';

export default class AddressSearchPlugin implements PluginInstance {
    api: PluginAPI;

    constructor(api: PluginAPI) {
        this.api = api;
    }

    static async install(_app: App, api: PluginAPI): Promise<PluginInstance> {
        return new AddressSearchPlugin(api);
    }

    async enable(): Promise<void> {
        state.pinia.value = this.api.pinia;
        state.api.value = this.api;

        try {
            state.workerClient.value = new SearchWorkerClient();
        } catch (err) {
            console.error('[address-search] failed to start search worker', err);
            return;
        }

        this.api.bottomBar.add({ key: BOTTOM_BAR_KEY, component: AddressSearchToggle });
    }

    async disable(): Promise<void> {
        this.api.bottomBar.remove(BOTTOM_BAR_KEY);

        state.workerClient.value?.terminate();
        state.workerClient.value = null;
        state.expanded.value = false;
        state.api.value = null;
        state.pinia.value = null;
    }
}
