import { guard } from "./utils";

/**
 * Creates a module whose code is loaded on its first start, e.g. an independently deployed bundle on a CDN.
 * `load` resolves to a module factory, or to an ES module whose default export is one:
 * `core.addModule("cart", remoteModule(() => import("https://cdn.example.com/cart.3f2a9c.js")))`.
 * A failed load fails that start like a failed init does, and the next start retries it.
 * The load function stays in the caller's code, so its bundler, import map or federation runtime resolves it.
 */
export function remoteModule(load: () => Promise<jc.ModuleFactory | { default: jc.ModuleFactory }>): jc.ModuleFactory {
    guard.function(load, "m28");
    let loading: Promise<jc.ModuleFactory> | undefined;

    return sandbox => (loading || (loading = load()
        .then(source => {
            const create = typeof source === "function" ? source : source && source.default;
            guard.function(create, "m29");
            return create;
        })
        .catch(err => {
            // A failed download is not cached by the browser either, so the next start retries it.
            loading = undefined;
            throw err;
        })))
        .then(create => create(sandbox));
}
