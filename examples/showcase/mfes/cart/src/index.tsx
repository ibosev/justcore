import type { CartItemAddedMessage, OrderPlacedMessage, ShowcaseMessage, ShowcaseModuleFactory } from "@showcase/contracts";
import { computed } from "nanostores";
import { render } from "solid-js/web";
import { cartBackend } from "./backend.ts";
import { createCart, type CartStore } from "./cart.ts";
import { Cart } from "./Cart.tsx";
import { adoptStyles, requireRoot } from "./dom.ts";
import css from "./styles.css?inline";

/**
 * Cart micro frontend. It owns the cart: other modules ask for changes with "cart.add" requests,
 * and read the "cart.summary" shared value this module publishes.
 */
const cartModule: ShowcaseModuleFactory = sandbox => {
    let cart: CartStore | undefined;
    let dispose: (() => void) | undefined;

    return {
        sandbox,
        async init(props) {
            const root = requireRoot(props);
            const { signal } = sandbox;
            adoptStyles(css, signal);

            const store = createCart(await cartBackend.load());
            const setSummary = sandbox.getService("shared").own("cart.summary", sandbox.moduleId, { count: 0, total: 0 });
            const unbindSummary = computed([store.$count, store.$total], (count, total) => ({ count, total })).subscribe(setSummary);
            const unbindSave = store.$lines.listen(lines => void cartBackend.save(lines));
            signal.addEventListener("abort", () => {
                unbindSummary();
                unbindSave();
            }, { once: true });

            cart = store;
            dispose = render(() => (
                <Cart
                    cart={store}
                    onCheckout={(items, total) => sandbox.publishAsync<OrderPlacedMessage>({ type: "order.placed", items, total })}
                />
            ), root);
        },
        moduleWillSubscribe: () => ["cart.add"],
        moduleDidReceiveMessage(message: ShowcaseMessage) {
            if (message.type !== "cart.add" || !cart) {
                return;
            }
            // Throws on invalid requests; the message bus logs it and other handlers are unaffected.
            cart.add(message.product, message.quantity);
            sandbox.publishAsync<CartItemAddedMessage>({
                type: "cart.itemAdded",
                productId: message.product.id,
                name: message.product.name,
                quantity: message.quantity
            });
        },
        destroy() {
            dispose?.();
            dispose = undefined;
            cart = undefined;
        }
    };
};

export default cartModule;
