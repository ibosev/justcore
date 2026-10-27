import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryOf, isVisible } from "./filter.ts";

const ring = { category: "wearables", name: "halo ring" };

test("the first path segment selects a category", () => {
    assert.equal(categoryOf("/wearables"), "wearables");
    assert.equal(categoryOf("/wearables/"), "wearables");
    assert.equal(categoryOf("/"), undefined);
    assert.equal(categoryOf("/unknown"), undefined);
});

test("category and search combine", () => {
    assert.equal(isVisible(ring, "/wearables", "RING"), true);
    assert.equal(isVisible(ring, "/audio", "ring"), false);
    assert.equal(isVisible(ring, "/", "watch"), false);
    assert.equal(isVisible(ring, "/"), true);
});
