# justcore showcase

Six micro frontends, each written in a different UI framework, each built, tested and deployed on its own. A small Astro shell loads them from a CDN at runtime and runs them as modules of one justcore core, following Nicholas Zakas's *Scalable JavaScript Application Architecture*. A team can publish a new version of its micro frontend, roll it back, or have it swapped into pages that are already open, without rebuilding anything else. The frameworks are not bundled into the micro frontends: each version is built once, loaded from the CDN through the import map and cached by the browser, so a deploy downloads only a few kilobytes.

![The shell with all six micro frontends running: the Solid cart and the Vue header badge show products added from the Svelte product page and the Angular recommendations, and every region is labelled with its framework and release version, and the inspector lists each module's version and where each module and shared library was loaded from.](screenshot.png)

| Micro frontend | Framework | Internal state | Reads shared state | Sends |
| --- | --- | --- | --- | --- |
| `mfes/header` | Vue | toast list | `?q=`, `cart.summary` | sets `?q=` |
| `mfes/navigation` | React | none | path | navigates |
| `mfes/catalog` | Astro, enhanced in the browser | none | path, `?q=`, `?product=` | sets `?product=` |
| `mfes/product-detail` | Svelte | product list from its API, quantity | `?product=` | `cart.add` request |
| `mfes/recommendations` | Angular | product list from its API | `?product=` | sets `?product=`, `cart.add` request |
| `mfes/cart` | SolidJS | cart lines, saved to its backend | none | owns `cart.summary`, handles `cart.add`, publishes `cart.itemAdded` and `order.placed` |
| `vendor` | React, Vue, Svelte, Solid, Angular | none | none | shared library files on the CDN, and the build plugin that points bundles at them |
| `shell` inspector | plain DOM | event log | module list with versions, shared libraries, download sizes | starts, stops and updates modules |
| `console` | plain DOM | none | the builds on the CDN, the live record | publishes the selected build of a micro frontend |

## Run it

The shell installs justcore from this repository, so build the library first.

```sh
# in the repository root
npm ci && npm run build

# in examples/showcase
npm ci
npm run build      # builds the shared libraries and every micro frontend into cdn/, publishes each one, builds the shell
npm start          # CDN and product API on :4400, shell on http://localhost:4329, deployment console on http://localhost:4330
npm test && npm run check
```

Things to try:

- Add a product from the Svelte page, or from the Angular recommendations below it. The Solid cart, the Vue header badge and a toast all update.
- Pick a category, search, and click a product. The URL changes, and back, forward and reload all restore the page.
- Stop the cart in the inspector and add a product. The request goes out, but nobody handles it. Start the cart again and it reloads its lines from its backend.
- Ship a release of all six together. The source is release 2.0.0, a redesign of every micro frontend that keeps the same contracts. In the deployment console, pick "1.0.0 for all" (when those builds are on the CDN) and press Publish all changes: the open shop swaps all six back within a few seconds. Pick "2.0.0 for all" to swap them forward again, styles included. They still talk to each other: add a product and the cart, the header badge and the product page's "The cart added …" line all update.
- Ship broken releases. `npm run build:faults` builds two on the CDN without publishing them: recommendations 2.1.0 fails during its start, and product detail 2.1.0 crashes when you press Add to cart. Publish them from the console.
  - Recommendations 2.1.0: the open page tries it, the core takes down what it had rendered, and the shell puts 2.0.0 back. The inspector logs the error and does not offer 2.1.0 again. Reload the page and there is no good version to fall back to, so the region shows the error while the rest of the shop works.
  - Product detail 2.1.0: it starts fine. Press Add to cart and the shell's error boundary stops it and shows the error in its region. The recommendations' + buttons still add to the cart. Publish 2.0.0 again and the open page starts the fixed version by itself.
- Deploy one micro frontend while the page is open. Change the heading in `mfes/cart/src/Cart.tsx`, raise `version` in `mfes/cart/package.json` to 2.0.1, then run the two commands below. Within a few seconds the page swaps in the new version by itself, without a page load, and the cart's label changes to `cart 2.0.1`. The inspector shows that only the few kilobytes of the new cart were downloaded: Solid was already loaded. Switch off automatic updates in the inspector to get an update button instead.
- Reload the page. The inspector's shared libraries table shows every framework file coming from the browser cache.

```sh
npm run build --workspace mfes/cart
node scripts/publish.mjs cart
```

## Documentation

The [documentation](docs/README.md) follows the whole flow, with diagrams:

1. [Architecture](docs/01-architecture.md): the parts, their owners and the rules that keep them independent.
2. [The shell](docs/02-shell.md): from the HTTP request to seven running modules.
3. [Loading remote micro frontends](docs/03-loading-remotes.md): bundles, import maps with integrity, and `remoteModule`.
4. [Shared state](docs/04-shared-state.md): the URL, owned values and internal state.
5. [Messages](docs/05-messages.md): requests, facts and delivery rules.
6. [Module lifecycle](docs/06-lifecycle.md): starting, stopping, failing and cleaning up.
7. [Deploying one micro frontend](docs/07-deploying.md): publishing, rolling back, canaries and contract changes.
8. [Runtime updates](docs/08-runtime-updates.md): swapping a running micro frontend, and its limits.
9. [Adding a micro frontend](docs/09-new-micro-frontend.md): how the Angular micro frontend was added.
10. [Shared framework libraries](docs/10-shared-libraries.md): frameworks loaded once from the CDN at the version each bundle needs, and upgrading one at runtime.
