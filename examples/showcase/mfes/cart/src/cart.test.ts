import assert from "node:assert/strict";
import { test } from "node:test";
import { createCart, parseLines } from "./cart.ts";

const speaker = { id: "pebble-speaker", name: "Pebble Speaker", price: 8900, color: "#0891b2" };
const lamp = { id: "glow-lamp", name: "Glow Lamp", price: 7900, color: "#16a34a" };

test("adding the same product twice merges into one line", () => {
    const cart = createCart();
    cart.add(speaker);
    cart.add(speaker, 2);

    assert.equal(cart.$lines.get().length, 1);
    assert.equal(cart.$count.get(), 3);
    assert.equal(cart.$total.get(), speaker.price * 3);
});

test("setting a quantity to zero removes the line", () => {
    const cart = createCart();
    cart.add(speaker);
    cart.add(lamp);

    cart.setQuantity(speaker.id, 0);

    assert.deepEqual(cart.$lines.get().map(line => line.product.id), [lamp.id]);
});

test("invalid requests are rejected without changing the cart", () => {
    const cart = createCart();
    assert.throws(() => cart.add(speaker, 0), RangeError);
    assert.throws(() => cart.add(speaker, 1.5), RangeError);
    assert.throws(() => cart.add({ ...speaker, price: -1 }), RangeError);
    assert.equal(cart.$count.get(), 0);
});

test("stored data is validated before it becomes cart state", () => {
    const stored = [
        { product: speaker, quantity: 2 },
        { product: { ...lamp, price: "free" }, quantity: 1 },
        { product: lamp, quantity: 0 },
        null
    ];

    assert.deepEqual(parseLines(stored), [{ product: speaker, quantity: 2 }]);
    assert.deepEqual(parseLines("garbage"), []);
});
