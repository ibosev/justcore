import { libraries, libraryOf, packageJson, specifierOf } from "./libraries.mjs";

/**
 * Leaves shared framework packages out of a micro frontend's bundle. Each import is rewritten to a
 * name that carries the installed version, e.g. "solid-js/web" becomes "solid-js@1.9.17/web", which
 * the live import map points at the vendor build on the CDN.
 */
export function sharedLibraries() {
    let root = process.cwd();
    return {
        name: "showcase-shared-libraries",
        enforce: "pre",
        configResolved(config) {
            root = config.root;
        },
        resolveId(source) {
            const library = libraryOf(source);
            if (!library) {
                return null;
            }
            if (!libraries[library.name].entries.includes(library.entry)) {
                this.error(`${source} is not provided by the vendor build; add "${library.entry}" to vendor/libraries.mjs`);
            }
            // The version this micro frontend installed, also for imports from its dependencies such as
            // @nanostores/solid, so one bundle never asks for two versions of the same library.
            const { version } = packageJson(library.name, root);
            return { id: specifierOf(library.name, version, library.entry), external: true };
        }
    };
}
