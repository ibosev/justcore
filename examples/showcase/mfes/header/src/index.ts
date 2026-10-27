import type { ShowcaseMessage, ShowcaseModuleFactory } from "@showcase/contracts";
import { atom } from "nanostores";
import { createApp, type App } from "vue";
import { adoptStyles, requireRoot } from "./dom.ts";
import Header from "./Header.vue";
import css from "./styles.css?inline";
import { toastText, type Toast } from "./toasts.ts";

const TOAST_MS = 3000;

/** App header micro frontend. Internal state: its toast list. Shared state: the query and the cart summary. */
const header: ShowcaseModuleFactory = sandbox => {
    let app: App | undefined;
    let nextId = 1;
    const $toasts = atom<readonly Toast[]>([]);

    return {
        sandbox,
        init(props) {
            adoptStyles(css, sandbox.signal);
            app = createApp(Header, {
                location: sandbox.getService("location"),
                shared: sandbox.getService("shared"),
                toasts: $toasts
            });
            app.mount(requireRoot(props));
        },
        moduleWillSubscribe: () => ["cart.itemAdded", "order.placed"],
        moduleDidReceiveMessage(message: ShowcaseMessage) {
            const text = toastText(message);
            if (!text) {
                return;
            }
            const toast = { id: nextId++, text };
            $toasts.set([...$toasts.get(), toast]);
            // The timer dies with the module: the sandbox signal aborts when the module stops.
            const timer = setTimeout(() => $toasts.set($toasts.get().filter(item => item !== toast)), TOAST_MS);
            sandbox.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
        },
        destroy() {
            app?.unmount();
            app = undefined;
            $toasts.set([]);
        }
    };
};

export default header;
