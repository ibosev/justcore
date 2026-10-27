import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProducts } from "./api.ts";

const lamp = { id: "glow-lamp", name: "Glow Lamp", category: "home", price: 7900, description: "Warm light.", color: "#16a34a" };

test("malformed products are dropped", () => {
    const products = parseProducts({ products: [lamp, { ...lamp, id: 7 }, { ...lamp, price: 79.5 }, null] });

    assert.deepEqual(products, [lamp]);
});

test("a response without a product list is an error", () => {
    assert.throws(() => parseProducts({}), /no product list/);
    assert.throws(() => parseProducts(null), /no product list/);
});
