import assert from "node:assert/strict";
import { test } from "node:test";
import type { Product } from "./api.ts";
import { related } from "./related.ts";

const product = (id: string, category: string): Product =>
    ({ id, name: id, category, price: 1000, description: "", color: "#000000" });
const products = [product("lamp", "home"), product("ring", "wearables"), product("rug", "home"), product("watch", "wearables")];

test("the selected product's category comes first and the product itself is left out", () => {
    assert.deepEqual(related(products, "lamp").map(item => item.id), ["rug", "ring", "watch"]);
});

test("the list is capped", () => {
    assert.deepEqual(related(products, "ring", 2).map(item => item.id), ["watch", "lamp"]);
});

test("nothing is recommended without a known selection", () => {
    assert.deepEqual(related(products, undefined), []);
    assert.deepEqual(related(products, "gone"), []);
});
