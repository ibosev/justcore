import type { CartAddMessage, CartItemAddedMessage, ShowcaseMessage, ShowcaseModuleFactory } from "@showcase/contracts";
import { atom } from "nanostores";
import { mount, unmount } from "svelte";
import { fetchProducts } from "./api.ts";
import { adoptStyles, requireRoot } from "./dom.ts";
import ProductDetail from "./ProductDetail.svelte";
import css from "./styles.css?inline";

/** Set by the build: "click" only in the deliberately broken release that npm run build:faults makes. */
declare const __SHOWCASE_FAULT__: string;

/**
 * Product detail micro frontend. The selected product is shared state (the "product" query value);
 * the product data comes from its own backend; "Add to cart" is a request to the cart over the bus,
 * and the cart's "cart.itemAdded" fact confirms it on the page.
 */
const productDetail: ShowcaseModuleFactory = sandbox => {
    let app: ReturnType<typeof mount> | undefined;
    const $added = atom<CartItemAddedMessage | undefined>(undefined);

    return {
        sandbox,
        async init(props) {
            const root = requireRoot(props);
            adoptStyles(css, sandbox.signal);
            // Asynchronous init: justcore lists the module as running only after the data arrived.
            const products = await fetchProducts(sandbox.signal);
            app = mount(ProductDetail, {
                target: root,
                props: {
                    products,
                    location: sandbox.getService("location"),
                    added: $added,
                    onAdd: (product, quantity) => {
                        if (__SHOWCASE_FAULT__ === "click") {
                            throw new TypeError(`Cannot read properties of undefined (reading 'sku'): ${product.name} has no stock record`);
                        }
                        sandbox.publishAsync<CartAddMessage>({
                            type: "cart.add",
                            product: { id: product.id, name: product.name, price: product.price, color: product.color },
                            quantity
                        });
                    }
                }
            });
        },
        moduleWillSubscribe: () => ["cart.itemAdded"],
        moduleDidReceiveMessage(message: ShowcaseMessage) {
            if (message.type === "cart.itemAdded") {
                $added.set(message);
            }
        },
        destroy() {
            if (app) {
                void unmount(app);
                app = undefined;
            }
            $added.set(undefined);
        }
    };
};

export default productDetail;
