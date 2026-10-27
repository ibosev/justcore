import assert from "node:assert/strict";
import { test } from "node:test";
import { init, parse } from "es-module-lexer";
import { exportedNames, importedNames, publish } from "./importmap.mjs";

const cdn = "https://cdn.example";
const deployed = {
    imports: { "mfe/cart": `${cdn}/cart/cart-A.js`, "mfe/header": `${cdn}/header/header-A.js` },
    integrity: { [`${cdn}/cart/cart-A.js`]: "sha384-cartA", [`${cdn}/header/header-A.js`]: "sha384-headerA" }
};

test("publishing one micro frontend leaves the others untouched and drops the replaced hash", () => {
    const next = publish(deployed, { id: "cart", url: `${cdn}/cart/cart-B.js`, integrity: "sha384-cartB" });
    assert.deepEqual(next, {
        imports: { "mfe/cart": `${cdn}/cart/cart-B.js`, "mfe/header": `${cdn}/header/header-A.js` },
        integrity: { [`${cdn}/header/header-A.js`]: "sha384-headerA", [`${cdn}/cart/cart-B.js`]: "sha384-cartB" }
    });
    assert.notEqual(next.imports, deployed.imports, "the input map is not mutated");
});

test("the first deploy of a micro frontend adds it", () => {
    const next = publish({ imports: {}, integrity: {} }, { id: "cart", url: `${cdn}/cart/cart-A.js`, integrity: "sha384-cartA" });
    assert.deepEqual(next.imports, { "mfe/cart": `${cdn}/cart/cart-A.js` });
});

test("a version's shared libraries are added, with hashes for every file they load, and kept on later deploys", () => {
    const web = `${cdn}/vendor/solid-js@1.9.17/web-A.js`;
    const chunk = `${cdn}/vendor/chunks/solid-A.js`;
    const libraries = { imports: { "solid-js@1.9.17/web": web }, integrity: { [web]: "sha384-web", [chunk]: "sha384-chunk" } };
    const withLibraries = publish(deployed, { id: "cart", url: `${cdn}/cart/cart-B.js`, integrity: "sha384-cartB", libraries });
    assert.equal(withLibraries.imports["solid-js@1.9.17/web"], web);
    assert.equal(withLibraries.integrity[chunk], "sha384-chunk");

    const rolledBack = publish(withLibraries, { id: "cart", url: `${cdn}/cart/cart-A.js`, integrity: "sha384-cartA" });
    assert.equal(rolledBack.imports["solid-js@1.9.17/web"], web);
    assert.equal(rolledBack.integrity[chunk], "sha384-chunk");
});

test("bare imports and the names taken from them are found in minified bundles", async () => {
    await init;
    const source = `import{a,render as b}from"solid-js@1.9.17/web";import"./style.js";import c,{d as e}from"@angular/core@22.2.3";import*as f from"vue@3.5.43";import("https://x.example/y.js");export default 1;`;
    assert.deepEqual(importedNames(parse(source)[0], source), {
        "solid-js@1.9.17/web": new Set(["a", "render"]),
        "@angular/core@22.2.3": new Set(["default", "d"]),
        "vue@3.5.43": new Set()
    });
});

test("exported names are listed unless a whole module is re-exported", async () => {
    await init;
    assert.deepEqual(exportedNames(parse(`export{a as render,b};export default 1;`)[1]), new Set(["render", "b", "default"]));
    assert.equal(exportedNames(parse(`export*from"./chunk.js";`)[1]), undefined);
});

test("versions are ordered numerically, not as text", async () => {
    const { compareVersions } = await import("./deployments.mjs");
    assert.deepEqual(["1.9.2", "1.10.0", "1.2.0"].sort(compareVersions), ["1.2.0", "1.9.2", "1.10.0"]);
});
