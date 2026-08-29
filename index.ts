/**
 * CloudTAK Address Search plugin — local-first address search over an OpenAddresses-derived
 * pack, with an optional online fallback. See docs/PLAN.md for the full phased plan; all 7 phases
 * are built as of Phase 6 (docs/cross-plugin-api.d.ts / docs/CROSS_PLUGIN_API.md).
 */
import type { App } from 'vue';
import type { PluginAPI, PluginInstance } from '../../plugin.ts';
import * as state from './lib/state.ts';
import { SearchWorkerClient } from './lib/worker/worker-client.ts';
import { syncManifestKv } from './lib/manifest-sync.ts';
import { deleteManifestKv } from './lib/core-bridge.ts';
import AddressSearchToggle from './components/AddressSearchToggle.vue';
import type { SearchOptions, SearchResult } from './lib/search/types.ts';

const BOTTOM_BAR_KEY = 'address-search';
/** PLAN.md §6's "namespaced id" for the runtime lookup API — same naming style as the `db.kv`
 *  manifest key (lib/core-bridge.ts's `MANIFEST_KV_KEY`), just on `window` instead of `db.kv`,
 *  since a live callable can't be stored as a `db.kv` string. See docs/cross-plugin-api.d.ts. */
const WINDOW_API_KEY = 'addresssearch:api';

/** Trims lib/search/types.ts's internal SearchResult down to the public contract (docs/
 *  cross-plugin-api.d.ts's AddressSearchResult) — explicitly listing fields rather than
 *  destructuring-to-discard the internal-only ones (matchedVia/numberMatchedVia/score, ranking
 *  diagnostics a consumer has no use for) so nothing here reads as an unused local. */
function toPublicResult(result: SearchResult) {
    return {
        displayAddress: result.displayAddress,
        lat: result.lat,
        lon: result.lon,
        number: result.number,
        numberExtra: result.numberExtra,
        streetDisplay: result.streetDisplay,
        city: result.city,
        postcode: result.postcode,
        units: result.units,
        distanceMeters: result.distanceMeters,
        // Phase 8: present (sourceKind: "gazetteer") for a place-name hit, absent for an address
        // hit — same widen-don't-replace approach as internal SearchResult itself.
        sourceKind: result.sourceKind,
        featureClass: result.featureClass,
        county: result.county,
        state: result.state,
    };
}

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

        // PLAN.md §6: publish the cross-plugin contract. Registered here (not module scope) so
        // it only exists while the plugin is actually enabled, matching bottomBar/worker lifecycle.
        (window as unknown as Record<string, unknown>)[WINDOW_API_KEY] = {
            search: async (query: string, opts?: SearchOptions) => {
                const results = (await state.workerClient.value?.search(query, opts)) ?? [];
                return results.map(toPublicResult);
            },
            geocode: async (addressString: string) => {
                const results = (await state.workerClient.value?.search(addressString, { limit: 1 })) ?? [];
                return results[0] ? toPublicResult(results[0]) : undefined;
            },
        };
        void syncManifestKv();
    }

    async disable(): Promise<void> {
        this.api.bottomBar.remove(BOTTOM_BAR_KEY);

        delete (window as unknown as Record<string, unknown>)[WINDOW_API_KEY];
        void deleteManifestKv();

        state.workerClient.value?.terminate();
        state.workerClient.value = null;
        state.expanded.value = false;
        state.api.value = null;
        state.pinia.value = null;
    }
}
