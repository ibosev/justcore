import assert from "node:assert/strict";
import { test } from "node:test";
import { libraryOf, specifierOf } from "./libraries.mjs";

test("imports are matched to the longest shared library name", () => {
    assert.deepEqual(libraryOf("react-dom/client"), { name: "react-dom", entry: "./client" });
    assert.deepEqual(libraryOf("react"), { name: "react", entry: "." });
    assert.deepEqual(libraryOf("@angular/core"), { name: "@angular/core", entry: "." });
});

test("packages that only share a prefix are not shared libraries", () => {
    assert.equal(libraryOf("solid-js-extra"), undefined);
    assert.equal(libraryOf("@nanostores/solid"), undefined);
    assert.equal(libraryOf("nanostores"), undefined);
});

test("import map names carry the version before the entry point", () => {
    assert.equal(specifierOf("solid-js", "1.9.17", "./web"), "solid-js@1.9.17/web");
    assert.equal(specifierOf("@angular/core", "22.2.3", "."), "@angular/core@22.2.3");
});
