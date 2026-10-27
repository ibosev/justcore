import type { ShowcaseModuleFactory } from "@showcase/contracts";
import { adoptStyles, requireRoot } from "./dom.ts";
import { isVisible } from "./filter.ts";
import css from "./styles.css?inline";
// Rendered by Astro just before this bundle is built, then inlined, so markup and code share one hash.
import fragment from "../dist/fragment.html?raw";

/**
 * Catalog micro frontend. Astro has no client-side component runtime, so Astro renders the grid at
 * build time and this module adds behavior to it. It reads the path and query (shared state) and writes the
 * selected product to the query. Everything is tied to sandbox.signal, so destroy has nothing to do.
 */
const catalog: ShowcaseModuleFactory = sandbox => ({
    sandbox,
    init(props) {
        const root = requireRoot(props);
        const { signal } = sandbox;
        const location = sandbox.getService("location");
        adoptStyles(css, signal);

        // Trusted markup: produced by this team's own build.
        root.innerHTML = fragment;
        signal.addEventListener("abort", () => root.replaceChildren(), { once: true });

        const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-product-id]"));
        const none = root.querySelector<HTMLElement>(".catalog__none");

        root.addEventListener("click", event => {
            const card = (event.target as Element).closest<HTMLElement>("[data-product-id]");
            if (card?.dataset.productId) {
                location.setQuery({ product: card.dataset.productId });
            }
        }, { signal });

        const render = () => {
            const path = location.$path.get();
            const query = location.$query.get();
            for (const card of cards) {
                card.hidden = !isVisible(card.dataset, path, query.q);
                card.toggleAttribute("data-selected", card.dataset.productId === query.product);
            }
            if (none) {
                none.hidden = cards.some(card => !card.hidden);
            }
        };
        const unbindPath = location.$path.subscribe(render);
        const unbindQuery = location.$query.listen(render);
        signal.addEventListener("abort", () => {
            unbindPath();
            unbindQuery();
        }, { once: true });
    },
    destroy() {
        // Nothing to do: listeners, subscriptions, styles and markup are released when the core aborts sandbox.signal.
    }
});

export default catalog;
