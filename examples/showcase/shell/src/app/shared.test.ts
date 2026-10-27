import assert from "node:assert/strict";
import { test } from "node:test";
import { createSharedState } from "./shared.ts";

test("readers see the value once its owner claims it, and every change after", () => {
    const shared = createSharedState();
    const seen: unknown[] = [];
    shared.read("cart.summary").subscribe(value => seen.push(value));

    const write = shared.own("cart.summary", "cart", { count: 0, total: 0 });
    write({ count: 1, total: 8900 });

    assert.deepEqual(seen, [undefined, { count: 0, total: 0 }, { count: 1, total: 8900 }]);
});

test("only the owner can claim a value", () => {
    const shared = createSharedState();
    shared.own("cart.summary", "cart", { count: 0, total: 0 });

    assert.throws(() => shared.own("cart.summary", "header", { count: 9, total: 9 }), /owned by "cart"/);
});

test("the owner claiming again keeps the current value", () => {
    const shared = createSharedState();
    shared.own("cart.summary", "cart", { count: 0, total: 0 })({ count: 2, total: 100 });

    shared.own("cart.summary", "cart", { count: 0, total: 0 });

    assert.deepEqual(shared.read("cart.summary").get(), { count: 2, total: 100 });
});
