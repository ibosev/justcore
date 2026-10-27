<script lang="ts">
    import type { CartItemAddedMessage, LocationService } from "@showcase/contracts";
    import type { ReadableAtom } from "nanostores";
    import type { Product } from "./api.ts";
    import { formatPrice } from "./format.ts";

    interface Props {
        products: readonly Product[];
        location: LocationService;
        /** The cart's latest "cart.itemAdded" fact. */
        added: ReadableAtom<CartItemAddedMessage | undefined>;
        onAdd(product: Product, quantity: number): void;
    }

    let { products, location, added, onAdd }: Props = $props();

    // nanostores follow the Svelte store contract, so $query just works.
    // svelte-ignore state_referenced_locally (the location service never changes for a running module)
    const query = location.$query;
    // svelte-ignore state_referenced_locally (the store never changes for a running module)
    const lastAdded = added;
    const product = $derived(products.find(item => item.id === $query.product));
    let quantity = $state(1);
    // Only the cart's confirmation shows here: a request nobody handled leaves no message.
    const confirmed = $derived(product && $lastAdded?.productId === product.id ? $lastAdded : undefined);

    $effect(() => {
        void product;
        quantity = 1;
    });
</script>

{#if product}
    <article class="detail">
        <div class="detail__tile" style={`--accent: ${product.color}`}>
            <span class="detail__initial">{product.name.charAt(0)}</span>
            <span class="detail__category">{product.category}</span>
        </div>
        <div class="detail__body">
            <h2>{product.name}</h2>
            <p>{product.description}</p>
            <div class="detail__buy">
                <strong class="detail__price">{formatPrice(product.price * quantity)}</strong>
                <div class="detail__stepper" role="group" aria-label="Quantity">
                    <button type="button" onclick={() => quantity = Math.max(1, quantity - 1)} aria-label="Decrease quantity">−</button>
                    <output>{quantity}</output>
                    <button type="button" onclick={() => quantity += 1} aria-label="Increase quantity">+</button>
                </div>
            </div>
            <button type="button" class="detail__add" onclick={() => onAdd(product, quantity)}>Add to cart</button>
            <p class="detail__confirmed" role="status">
                {#if confirmed}✓ The cart added {confirmed.quantity} × {confirmed.name}{/if}
            </p>
        </div>
    </article>
{:else}
    <div class="detail__empty">
        <span aria-hidden="true">←</span>
        <p>Pick a product from the catalog to see it here.</p>
    </div>
{/if}
