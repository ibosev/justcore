import assert from "node:assert/strict";
import { test } from "node:test";
import { toastText } from "./toasts.ts";

test("facts become toasts", () => {
    assert.equal(toastText({ type: "cart.itemAdded", productId: "loop-band", name: "Loop Band", quantity: 2 }), "Added 2 × Loop Band");
    assert.equal(toastText({ type: "order.placed", items: 3, total: 17800 }), "Order placed: 3 items, $178.00");
});

test("requests do not", () => {
    const product = { id: "loop-band", name: "Loop Band", price: 5900, color: "#ea580c" };
    assert.equal(toastText({ type: "cart.add", product, quantity: 1 }), undefined);
});
