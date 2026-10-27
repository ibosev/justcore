import assert from "node:assert/strict";
import { test } from "node:test";
import { activePath } from "./links.ts";

test("a trailing slash selects the same section", () => {
    assert.equal(activePath("/wearables/"), "/wearables");
});

test("unknown paths select all products", () => {
    assert.equal(activePath("/nope"), "/");
    assert.equal(activePath("/"), "/");
});
