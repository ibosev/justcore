# Not released
*

# 3.0.0

Breaking changes.

* Bundles now target ES2019 instead of ES5. The UMD and ES module formats are unchanged. The reduceRight polyfill is removed.
* `startModule` and `stopModule` return a promise. `startModule` rejects with the error when the factory, `init` or subscribing fails, after the instance is cleaned up; it previously only logged the failure. `stopModule` logs a failing `destroy` and resolves. Guard errors still throw synchronously.
* Module `init` and `destroy` may return a promise. An instance appears in `runningModules` only after `init` completes. Stopping during a pending `init` waits for it.
* Each sandbox has a `signal` that aborts when its instance stops or fails to start. Pass it to `addEventListener` or `fetch` to release resources automatically.
* A failing `destroy` now untracks the instance and releases its subscriptions. It previously stayed listed as running with no subscriptions.
* A failed start releases subscriptions made so far, and calls `destroy` when `init` itself had completed.
* Messages published before a module stops are no longer delivered to it.
* Duplicate message types in `moduleWillSubscribe` no longer leak a subscription after stop.
* An empty `moduleWillSubscribe` list no longer requires `moduleDidReceiveMessage`.
* Starting an instance from inside its own `init` no longer creates a second instance.
* The `module-autosubscribe` extension is removed: the core subscribes a module to the messages it lists after `init`, and still fires `onModuleSubscribe` and `onModuleReceiveMessage`. `core.extensions` no longer lists it.
* A module factory may return a promise. `remoteModule` uses that instead of a stand-in module, so hooks and extensions see the loaded module itself.
* Each core has its own `Sandbox` subclass, so augmenting `core.Sandbox.prototype` no longer reaches other cores. `sandbox._extensionsOnlyCore` is removed; extensions use the core passed to `install`. A module's `sandbox` must be the one passed to its factory.
* Core methods are hooked when the core is constructed instead of on `init`. `createHook` returns the method's own type; `HookProps` (`_withPipeline`, `_hookType`) is removed. The `Core` constructor no longer takes its collaborators.
* Extensions written for 2.x keep working unchanged. A plugin that calls `next()` without returning it still has asynchronous init, destroy, start and stop awaited, because the hook system passes the promise through.
* Services whose factory returns a falsy value are created once, like other services.
* Typings are generated from the source into `dist/types` instead of being maintained by hand; `jc.CoreClass` is removed, use `typeof Core`. `init` and `moduleDidReceiveProps` props are optional, an extension's `install` may return nothing, and `moduleDidReceiveMessage` implementations may narrow the message type.
* Added `remoteModule(load)`: registers a module whose code is loaded on first start, such as an independently deployed bundle on a CDN. Load failures fail that start and the next start retries.
* Added `examples/showcase`: independently built and deployed micro frontends in React, Vue, Svelte, SolidJS, Angular and Astro, loaded from a CDN through a server-rendered import map with integrity hashes, sharing framework libraries through versioned import map names, sharing URL state through the shell, talking over the message bus, and swapped into open pages automatically at runtime. Each build carries its release version in its path, and a small deployment console publishes any build on the CDN. Documented with diagrams in `examples/showcase/docs`.
* Tooling: TypeScript 7, one Rollup config fed by `tsc` output, Jasmine in Node instead of Karma and PhantomJS, GitHub Actions on Node 24, and checks against the built bundles and published typings. TSLint was removed. API docs are generated with TypeDoc 0.28 from an isolated toolchain in `tools/docs` that uses TypeScript 6; delete it once TypeDoc supports TypeScript 7.

# 2.0.0
* Added service locator
* Move to typescript 3.7
