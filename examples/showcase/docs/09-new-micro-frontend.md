# 9. Adding a micro frontend

The sixth micro frontend, `recommendations`, was added after the other five were running. It shows products related to the one on display, so it reads the `product` query value, asks the shell to change it, and sends `cart.add` requests. It is written in Angular. This chapter follows the steps it took. The steps are the same for any framework, and only the plugin and the mount code differ.

## What changes, and who deploys it

| Change | Owned by | Needs a deploy of |
| --- | --- | --- |
| The new package in `mfes/recommendations` | the new team | the new micro frontend |
| New message types or shared values, if any | all teams, reviewed together | nothing; `contracts` is types only |
| A region in the page and an entry in the module list | the platform team | the shell |

The new micro frontend can be built, deployed and published before the shell knows it. Users see it once the shell deploy adds its region. Recommendations needed no contract change: `cart.add` and the location service already existed.

## 1. Create the package

```json
{
  "name": "@showcase/mfe-recommendations",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "test": "node --test \"src/*.test.ts\"",
    "check": "ngc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@angular/common": "22.2.3",
    "@angular/compiler": "22.2.3",
    "@angular/core": "22.2.3",
    "@angular/platform-browser": "22.2.3",
    "nanostores": "1.5.5",
    "rxjs": "7.8.2",
    "tslib": "2.8.1"
  },
  "devDependencies": {
    "@analogjs/vite-plugin-angular": "2.9.1",
    "@angular/build": "22.2.3",
    "@angular/compiler-cli": "22.2.3",
    "@showcase/contracts": "1.0.0",
    "@showcase/vendor": "1.0.0",
    "justcore": "file:../../../..",
    "typescript": "6.0.3",
    "vite": "8.3.4"
  }
}
```

The folder sits under `mfes/`, so the workspace picks it up. Exact versions are pinned, like the other micro frontends: the pinned Angular version decides which shared Angular files the bundle imports. `ngc` is Angular's compiler, so `check` also type-checks the templates.

## 2. Configure the build

```ts
// mfes/recommendations/vite.config.ts
import angular from "@analogjs/vite-plugin-angular";
import { sharedLibraries } from "@showcase/vendor/plugin";
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
    // Compiles components ahead of time, so the bundle ships without Angular's template compiler.
    plugins: [sharedLibraries(), angular({ tsconfig: "tsconfig.json" })],
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
        outDir: "../../cdn/recommendations",
        emptyOutDir: false,
        manifest: true,
        lib: { entry: "src/index.ts", formats: ["es"] },
        rolldownOptions: { output: { entryFileNames: `${pkg.version}/recommendations-[hash].js`, minify: true } }
    }
});
```

Angular's own builder produces applications, not a module that exports a factory, so the Analog Vite plugin does the compiling instead. It turns templates into code ahead of time, which keeps the 1 MB template compiler out of the page. `sharedLibraries()` leaves Angular itself out of the bundle: imports of `@angular/core` become `@angular/core@22.2.3`, served from the shared vendor build. The bundle is 4.4 KB, or 2 KB gzipped. With Angular bundled in, it was 117 KB.

If the vendor build does not provide the framework yet, the platform team adds it to `vendor/libraries.mjs` and `vendor/package.json` first. Chapter 10 describes both.

Whatever the framework, keep `sharedLibraries()`, `emptyOutDir: false`, the version folder and the hash in the file name, and the manifest. The version comes from `"version": "1.0.0"` in the micro frontend's `package.json`. Chapters 7 and 10 depend on them.

The `tsconfig.json` sets `rewriteRelativeImportExtensions`. The sources import `./related.ts` with its extension so that `node --test` can run them directly, and the Angular compiler needs that option to accept such imports. It also sets `declaration: false`, because the Analog plugin otherwise writes `.d.ts` files next to the bundle in library mode, and those would end up on the CDN.

## 3. Write the module

`dom.ts`, `format.ts` and `api.ts` were copied from the product page: micro frontends share types, not code. The module factory creates a new Angular application on every start, and destroys it on stop:

```ts
// mfes/recommendations/src/index.ts
const recommendations: ShowcaseModuleFactory = sandbox => {
    let app: ApplicationRef | undefined;
    let host: HTMLElement | undefined;

    return {
        sandbox,
        async init(props) {
            const root = requireRoot(props);
            adoptStyles(css, sandbox.signal);
            const products = await fetchProducts(sandbox.signal);
            app = await createApplication({
                providers: [
                    provideZonelessChangeDetection(),
                    {
                        provide: CONTEXT,
                        useValue: {
                            products,
                            location: sandbox.getService("location"),
                            add: product => sandbox.publishAsync<CartAddMessage>({
                                type: "cart.add",
                                product: { id: product.id, name: product.name, price: product.price, color: product.color },
                                quantity: 1
                            })
                        } satisfies RecommendationsContext
                    }
                ]
            });
            // Angular takes over the element it bootstraps into, so give it a child it can own.
            host = root.appendChild(document.createElement("mfe-recommendations"));
            app.bootstrap(RecommendationsComponent, host);
        },
        destroy() {
            app?.destroy();
            host?.remove();
            app = host = undefined;
        }
    };
};
```

Three choices here apply to any framework:

- **The sandbox stays outside the component.** The component gets a small context through an injection token: the data, the location service and an `add` function. It never sees `publishAsync` or the message format.
- **There's no zone.js.** Angular 22 runs without it, using signals, so the bundle doesn't patch browser APIs that the shell and the other micro frontends also use.
- **Each start is a fresh application.** Stopping destroys the application with all its injectors and effects. A restart or a runtime swap therefore starts from nothing.

Angular has no nanostores binding, and it needs none. A five-line helper copies an atom into a signal for as long as the component lives:

```ts
// mfes/recommendations/src/store.ts
export function fromStore<T>(store: ReadableAtom<T>): Signal<T> {
    const value = signal(store.get());
    inject(DestroyRef).onDestroy(store.listen(next => value.set(next)));
    return value.asReadonly();
}
```

The component builds on that helper. It reads shared state, and to change shared state it asks the shell:

```ts
// mfes/recommendations/src/recommendations.component.ts
export class RecommendationsComponent {
    protected readonly context = inject(CONTEXT);
    private readonly query = fromStore(this.context.location.$query);
    protected readonly items = computed(() => related(this.context.products, this.query().product));

    protected show(product: Product): void {
        this.context.location.setQuery({ product: product.id });
    }
}
```

The checklist from chapter 8 applied from day one:

- **No side effects at import time.** Nothing runs until `init`.
- **Everything is tied to the signal or undone in `destroy`.** The signal removes the styles and cancels the product request. `destroy` takes down the application and its store subscription.
- **State that must survive is kept in the team's backend.** Recommendations have none: the product list is fetched again on start.
- **Shared state is read, never written directly.** Clicking a name calls `setQuery`, and the product page, the catalog and recommendations all follow the URL.

## 4. Extend the contract, if needed

If a new micro frontend needs a new message or shared value, add it to `contracts/index.d.ts` and to the `ShowcaseMessage` union or `SharedValues`. Keep the change additive. Every team compiles against the contract, so it is the one change that needs everyone's review. Recommendations reused what was there.

## 5. Test it on its own

The logic is a plain function, `related` in `src/related.ts`, tested with `node --test` like `links.ts` in navigation or `cart.ts` in the cart. The factory and the component are thin glue around it.

```sh
npm test --workspace mfes/recommendations
npm run check --workspace mfes/recommendations
```

## 6. Build and publish it

```sh
npm run build --workspace mfes/recommendations
node scripts/publish.mjs recommendations
```

The record now contains `mfe/recommendations` and the `@angular/*@22.2.3` library names it imports, but no page uses it yet. Publishing fails if the vendor build has not put those libraries on the CDN. The workspace was also added to `build:mfes`, and the id to the publish list in the root `package.json`, so a full build includes it.

## 7. Give it a place in the shell

Three small edits in `shell/`, then a shell deploy:

```ts
// shell/src/app/registry.ts
export const moduleInfo = [
    // …
    { id: "recommendations", framework: "Angular", remote: true },
    { id: "cart", framework: "SolidJS", remote: true },
    { id: "inspector", framework: "plain DOM", remote: false }
] as const;
```

```astro
<!-- shell/src/pages/index.astro, in the right-hand column -->
<section class="region" aria-label="Recommendations" {...region("recommendations")}></section>
```

```css
/* shell/src/styles/global.css: the region's label colour, with a lighter one for dark mode */
.region[data-framework="Angular"] { --framework: var(--angular); }
```

On the next page load the shell starts it with the others, loads it from the CDN through the import map, and lists it in the inspector with its own start, stop and update controls. From then on the recommendations team deploys on its own. Chapters 7 and 8 apply unchanged: a new recommendations build swaps into open pages next to the React, Vue, Svelte and Solid modules. If it was built against the same Angular version, it reuses the Angular runtime the page already loaded. Each start still creates its own Angular application, so the old and new versions never share an injector.
