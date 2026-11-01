/**
 * Module-scoped plugin state — the same reasoning as the measure plugin's lib/state.ts: plugins
 * share one Vite bundle and one runtime, so a module singleton is the simplest way for the
 * bottom-bar toggle, the search bar, and the gear panel to talk to the same Worker client without
 * prop-plumbing through the core component tree.
 *
 * Not covered by this repo's own tsconfig.json (see its `exclude`) — it imports `vue`/`pinia`,
 * which resolve against app's own node_modules at bundle time and aren't devDependencies
 * here, matching the measure plugin's zero-runtime-deps convention. Verified only via the
 * copy-into-CloudTAK + vue-tsc step.
 */
import { ref, shallowRef } from "vue";
import type { Pinia } from "pinia";
import type { PluginAPI } from "../../../plugin.ts";
import { SearchWorkerClient } from "./worker/worker-client.ts";

export const pinia = shallowRef<Pinia | null>(null);
export const api = shallowRef<PluginAPI | null>(null);
export const expanded = ref(false);
export const workerClient = shallowRef<SearchWorkerClient | null>(null);

export interface BundledLoadStatus {
    active: boolean;
    file: string;
    sectionsDone: number;
    sectionsTotal: number;
    error: string;
}

/** Progress for packs loaded from `/address-search/` on enable. The dataset menu reads this. */
export const bundledLoad = ref<BundledLoadStatus>({
    active: false,
    file: "",
    sectionsDone: 0,
    sectionsTotal: 0,
    error: "",
});

/** Bumped after each bundled pack lands so an open dataset menu refreshes its list. */
export const bundledRevision = ref(0);

export function open(): void {
    expanded.value = true;
}

export function close(): void {
    expanded.value = false;
}

export function toggle(): void {
    expanded.value = !expanded.value;
}
