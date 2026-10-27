import { useStore } from "@nanostores/solid";
import { For, Show } from "solid-js";
import type { CartStore } from "./cart.ts";
import { formatPrice } from "./format.ts";

/** In cents. */
const FREE_SHIPPING = 50000;

interface Props {
    cart: CartStore;
    onCheckout(items: number, total: number): void;
}

export function Cart(props: Props) {
    const lines = useStore(props.cart.$lines);
    const count = useStore(props.cart.$count);
    const total = useStore(props.cart.$total);
    const toFreeShipping = () => Math.max(0, FREE_SHIPPING - total());

    const checkout = () => {
        props.onCheckout(count(), total());
        props.cart.clear();
    };

    return (
        <div class="cart">
            <div class="cart__head">
                <h2>Your bag</h2>
                <span class="cart__count">{count()}</span>
            </div>
            <Show when={lines().length} fallback={<p class="cart__empty">Nothing here yet. Add something you like.</p>}>
                <div class="cart__shipping">
                    <span>{toFreeShipping() ? `${formatPrice(toFreeShipping())} away from free shipping` : "Free shipping unlocked"}</span>
                    <span class="cart__meter" style={{ "--progress": `${Math.min(100, total() / FREE_SHIPPING * 100)}%` }} />
                </div>
                <ul class="cart__lines">
                    <For each={lines()}>
                        {line => (
                            <li class="cart__line">
                                <span class="cart__swatch" style={{ "--accent": line.product.color }}>{line.product.name.charAt(0)}</span>
                                <span class="cart__name">{line.product.name}</span>
                                <div class="cart__stepper" role="group" aria-label={`${line.product.name} quantity`}>
                                    <button type="button" aria-label="Decrease quantity"
                                        onClick={() => props.cart.setQuantity(line.product.id, line.quantity - 1)}>−</button>
                                    <output>{line.quantity}</output>
                                    <button type="button" aria-label="Increase quantity"
                                        onClick={() => props.cart.setQuantity(line.product.id, line.quantity + 1)}>+</button>
                                </div>
                                <span class="cart__price">{formatPrice(line.product.price * line.quantity)}</span>
                            </li>
                        )}
                    </For>
                </ul>
                <div class="cart__total">
                    <span>Total</span>
                    <strong>{formatPrice(total())}</strong>
                </div>
                <button type="button" class="cart__checkout" onClick={checkout}>Checkout · {formatPrice(total())}</button>
            </Show>
        </div>
    );
}
