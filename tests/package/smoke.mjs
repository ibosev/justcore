// Loads each built bundle the way a consumer would and runs one module through its lifecycle.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

globalThis.document = Object.assign(new EventTarget(), { readyState: "complete" });
const require = createRequire(import.meta.url);
const pkg = require("../../package.json");
const esm = readFileSync(new URL("../../dist/justcore.module.js", import.meta.url), "utf8");

const bundles = {
    umd: () => require("../../dist/justcore.umd.js"),
    "umd.min": () => require("../../dist/justcore.umd.min.js"),
    module: () => import(`data:text/javascript,${encodeURIComponent(esm)}`)
};

for (const [name, load] of Object.entries(bundles)) {
    const { Core, remoteModule } = await load();
    const core = new Core();
    const calls = [];
    assert.equal(core.version, pkg.version, name);
    await new Promise(resolve => core.init(resolve));
    core.addModule("m", sandbox => ({
        sandbox,
        init: () => { calls.push("init"); },
        destroy: () => { calls.push("destroy"); }
    }));
    await core.startModule("m");
    assert.deepEqual({ ...core.runningModules }, { m: ["m"] }, name);
    await core.stopModule("m");
    assert.deepEqual(calls, ["init", "destroy"], name);

    core.addModule("broken", sandbox => ({ sandbox, init: () => { throw new Error("boom"); }, destroy: () => undefined }));
    await assert.rejects(core.startModule("broken"), /boom/, name);

    core.addModule("remote", remoteModule(() => Promise.resolve({
        default: sandbox => ({ sandbox, init: () => { calls.push("remote init"); }, destroy: () => undefined })
    })));
    await core.startModule("remote");
    assert.deepEqual({ ...core.runningModules }.remote, ["remote"], name);
    assert.equal(calls.at(-1), "remote init", name);
    console.info(`${name}: ok`);
}
