// The framework packages every micro frontend loads from the CDN instead of bundling, and the entry
// points of each that the vendor build provides. Used by the vendor build and by the micro frontends'
// Vite plugin, so a micro frontend cannot import an entry point the CDN does not have.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const libraries = {
    react: { entries: [".", "./jsx-runtime"], commonjs: true },
    "react-dom": { entries: ["./client"], commonjs: true },
    // The browser build has its feature flags baked in, so consumers need no build-time defines.
    vue: { entries: ["."], file: "dist/vue.runtime.esm-browser.prod.js" },
    svelte: { entries: [".", "./internal/client", "./internal/disclose-version"] },
    "solid-js": { entries: [".", "./web", "./store"] },
    "@angular/core": { entries: ["."] },
    "@angular/common": { entries: ["."] },
    "@angular/platform-browser": { entries: ["."] }
};

const names = Object.keys(libraries).sort((a, b) => b.length - a.length);

/** Splits "solid-js/web" into the library and its entry point, or returns undefined for other packages. */
export function libraryOf(source) {
    const name = names.find(candidate => source === candidate || source.startsWith(`${candidate}/`));
    return name && { name, entry: `.${source.slice(name.length)}` };
}

/** The import map name of one entry point of one version, e.g. "solid-js@1.9.17/web". */
export const specifierOf = (name, version, entry) => `${name}@${version}${entry.slice(1)}`;

/** Finds an installed package's package.json the way Node does, from `fromDir` upwards. */
export function packageJson(name, fromDir) {
    for (let dir = fromDir; ; dir = dirname(dir)) {
        const path = join(dir, "node_modules", name, "package.json");
        if (existsSync(path)) {
            return { dir: dirname(path), ...JSON.parse(readFileSync(path, "utf8")) };
        }
        if (dirname(dir) === dir) {
            throw new Error(`${name} is not installed`);
        }
    }
}
