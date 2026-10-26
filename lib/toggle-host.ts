export const ADDRESS_SEARCH_BOTTOM_BAR_KEY = 'address-search';

export type BottomBarLike = {
    remove: (key: string) => void;
};

/**
 * CloudTAK renders PluginPane (a 50px strip) whenever any bottom-bar item
 * is registered. The search button is teleported out of that slot, so
 * registering it leaves the strip empty. Drop a stale `address-search` key
 * and mount the toggle ourselves.
 */
export function attachChrome(host: {
    bottomBar: BottomBarLike;
    mountToggle: () => void;
}): void {
    host.bottomBar.remove(ADDRESS_SEARCH_BOTTOM_BAR_KEY);
    host.mountToggle();
}

export function detachChrome(host: {
    bottomBar: BottomBarLike;
    unmountToggle: () => void;
}): void {
    host.unmountToggle();
    host.bottomBar.remove(ADDRESS_SEARCH_BOTTOM_BAR_KEY);
}
