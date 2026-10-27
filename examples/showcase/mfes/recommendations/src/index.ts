import { type ApplicationRef, provideZonelessChangeDetection } from "@angular/core";
import { createApplication } from "@angular/platform-browser";
import type { CartAddMessage, ShowcaseModuleFactory } from "@showcase/contracts";
import { fetchProducts } from "./api.ts";
import { adoptStyles, requireRoot } from "./dom.ts";
import { CONTEXT, RecommendationsComponent, type RecommendationsContext } from "./recommendations.component.ts";
import css from "./styles.css?inline";

/** Set by the build: "start" only in the deliberately broken release that npm run build:faults makes. */
declare const __SHOWCASE_FAULT__: string;

/**
 * Recommendations micro frontend. Reads the selected product from the URL, fetches the catalog from
 * its own backend and sends "cart.add" requests, like the product page. Each start is a new Angular
 * application, so a stopped module leaves no injector, effect or listener behind. The application is
 * tied to sandbox.signal, so it is taken down on a stop and also when init fails after rendering.
 */
const recommendations: ShowcaseModuleFactory = sandbox => ({
    sandbox,
    async init(props) {
        const root = requireRoot(props);
        adoptStyles(css, sandbox.signal);
        const products = await fetchProducts(sandbox.signal);
        const app: ApplicationRef = await createApplication({
            providers: [
                provideZonelessChangeDetection(),
                {
                    provide: CONTEXT,
                    useValue: {
                        products,
                        location: sandbox.getService("location"),
                        add: product => sandbox.publishAsync<CartAddMessage>({
                            type: "cart.add",
                            product: { id: product.id, name: product.name, price: product.price, color: product.color },
                            quantity: 1
                        })
                    } satisfies RecommendationsContext
                }
            ]
        });
        // Angular takes over the element it bootstraps into, so give it a child it can own.
        const host = root.appendChild(document.createElement("mfe-recommendations"));
        sandbox.signal.addEventListener("abort", () => {
            app.destroy();
            host.remove();
        }, { once: true });
        app.bootstrap(RecommendationsComponent, host);
        if (__SHOWCASE_FAULT__ === "start") {
            // After rendering: the core aborts the signal, which takes down what was rendered.
            throw new Error("related products: expected a list, the API sent an object");
        }
    },
    destroy() {
        // Nothing to do: the application and its element are released when the core aborts sandbox.signal.
    }
});

export default recommendations;
