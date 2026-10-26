import { createApp, type App } from 'vue';
import AddressSearchToggle from '../components/AddressSearchToggle.vue';

const ROOT_ID = 'address-search-toggle-root';

let toggleApp: App | null = null;
let toggleEl: HTMLElement | null = null;

/** Host node only. AddressSearchToggle teleports the button to <body>. */
export function mountAddressSearchToggle(): void {
    if (toggleApp) return;

    const el = document.createElement('div');
    el.id = ROOT_ID;
    el.hidden = true;
    document.body.appendChild(el);
    toggleEl = el;

    toggleApp = createApp(AddressSearchToggle);
    toggleApp.mount(el);
}

export function unmountAddressSearchToggle(): void {
    if (toggleApp) {
        toggleApp.unmount();
        toggleApp = null;
    }
    toggleEl?.remove();
    toggleEl = null;
    document.getElementById(ROOT_ID)?.remove();
}
