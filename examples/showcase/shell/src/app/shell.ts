import { remoteModule } from "justcore";
import { atom, type ReadableAtom } from "nanostores";
import { moduleInfo, specifierOf, type ModuleId } from "./registry.ts";

export interface ImportMap {
    imports: Record<string, string>;
    integrity: Record<string, string>;
}

export interface ModuleEntry {
    id: ModuleId;
    framework: string;
    /** Where the running code came from: a CDN URL for remotes, "shell" for the shell's own modules. */
    source: string;
    /** A newer deployment found in the live import map, not loaded yet. */
    update?: string;
    /** A deployment that failed to start here; it is not offered again. */
    rejected?: string;
}

export interface LibraryEntry {
    /** The import map name, with its version, e.g. "solid-js@1.9.17/web". */
    name: string;
    url: string;
}

/** Lets a module start, stop and update other modules without knowing where they live in the page. */
export interface ShellService {
    readonly $modules: ReadableAtom<readonly ModuleEntry[]>;
    /** Shared framework libraries this page can load from the CDN. */
    readonly $libraries: ReadableAtom<readonly LibraryEntry[]>;
    /** Files the libraries import by relative URL: hashed in the import map, but named by no entry. */
    readonly $libraryChunks: ReadableAtom<readonly string[]>;
    /** Whether newer deployments are swapped in as soon as they are found. */
    readonly $autoUpdate: ReadableAtom<boolean>;
    setAutoUpdate(on: boolean): void;
    /** Resolves to whether the module started; a failure is logged and shown on the module's region. */
    start(id: ModuleId): Promise<boolean>;
    stop(id: ModuleId): Promise<void>;
    /** Swaps in the newer deployment without a page load. Puts the old version back if the new one fails to start. */
    update(id: ModuleId): Promise<void>;
    /** Reads the live import map, marks remotes that have a newer deployment, and swaps them in if auto-update is on. */
    checkForUpdates(): Promise<void>;
}

interface ShellOptions {
    /** The import map the server rendered into this page. */
    importMap: ImportMap;
    /** Loads a module by import map name or URL. Must be the page's own import(), so the browser resolves the name. */
    importModule(specifier: string): Promise<unknown>;
    /** The shell's own modules, bundled with the shell. */
    local: Partial<Record<ModuleId, jc.ModuleFactory>>;
    autoUpdate: boolean;
    log(label: string, kind?: "lifecycle" | "error"): void;
}

const fileOf = (url: string) => url.split("/").pop();

/** The release version in a bundle URL such as ".../cart/1.1.0/cart-DqFGBwNj.js", if it has one. */
export const versionOf = (url: string | undefined) => url?.match(/\/(\d+\.\d+\.\d+[^/]*)\/[^/]+$/)?.[1];

/** "1.1.0" for a versioned URL, the file name otherwise; used in log lines and labels. */
const releaseOf = (url: string) => versionOf(url) ?? fileOf(url);

const addImportMap = (map: Partial<ImportMap>) => {
    const script = document.createElement("script");
    script.type = "importmap";
    script.textContent = JSON.stringify(map);
    document.head.append(script);
};

/**
 * Whether this browser merges import maps added after modules have loaded (Chrome 133, Safari 18.4;
 * Firefox only behind a flag). Without it, a hash added for a new version would be silently ignored.
 */
const canAddImportMaps = () => {
    addImportMap({ imports: { "shell-import-map-probe": "/probe" } });
    try {
        return import.meta.resolve("shell-import-map-probe").endsWith("/probe");
    } catch {
        return false;
    }
};

export function createShell(core: jc.Core, { importMap, importModule, local, autoUpdate, log }: ShellOptions): ShellService {
    const $modules = atom<readonly ModuleEntry[]>(moduleInfo.map(info => ({
        id: info.id,
        framework: info.framework,
        source: info.remote ? importMap.imports[specifierOf(info.id)] ?? "missing from import map" : "shell"
    })));
    const isModuleName = (name: string) => moduleInfo.some(info => specifierOf(info.id) === name);
    const librariesIn = (imports: Record<string, string>) =>
        Object.entries(imports).filter(([name]) => !isModuleName(name)).map(([name, url]) => ({ name, url }));
    const $libraries = atom<readonly LibraryEntry[]>(librariesIn(importMap.imports));
    const chunksIn = (...maps: ImportMap[]) => {
        const named = new Set(maps.flatMap(map => Object.values(map.imports)));
        return [...new Set(maps.flatMap(map => Object.keys(map.integrity)))].filter(url => !named.has(url));
    };
    const $libraryChunks = atom<readonly string[]>(chunksIn(importMap));
    const $autoUpdate = atom(autoUpdate);
    const entryOf = (id: ModuleId) => $modules.get().find(entry => entry.id === id)!;
    const patch = (id: ModuleId, change: Partial<ModuleEntry>) =>
        $modules.set($modules.get().map(entry => entry.id === id ? { ...entry, ...change } : entry));
    const remote = (specifier: string) => remoteModule(() => importModule(specifier) as Promise<jc.ModuleFactory>);

    // The code currently behind each id. The core calls the registered factory on every start,
    // so replacing an entry here changes what the next start of that module loads.
    const factories = new Map<ModuleId, jc.ModuleFactory>();
    // The URL behind each remote's current factory; its version is shown on the region's label.
    const loadedFrom = new Map<ModuleId, string>();
    for (const info of moduleInfo) {
        if (info.remote) {
            loadedFrom.set(info.id, importMap.imports[specifierOf(info.id)] ?? "");
        }
        const factory = info.remote ? remote(specifierOf(info.id)) : local[info.id];
        if (!factory) {
            throw new Error(`no factory for module "${info.id}"`);
        }
        factories.set(info.id, factory);
        core.addModule(info.id, sandbox => factories.get(info.id)!(sandbox));
    }

    const regionOf = (id: ModuleId) => {
        const region = document.querySelector<HTMLElement>(`[data-module="${id}"]`);
        if (!region) {
            throw new Error(`no region for module "${id}"`);
        }
        return region;
    };
    const isRunning = (id: ModuleId) => !!core.runningModules[id]?.length;
    const messageOf = (err: unknown) => err instanceof Error ? err.message : String(err);
    const fail = (id: ModuleId, err: unknown) => {
        const region = regionOf(id);
        region.dataset.state = "failed";
        region.dataset.error = messageOf(err);
    };
    let latest = importMap;
    let mergesImportMaps: boolean | undefined;
    // Names and hashes this page already registered. Registering one again is ignored with a console
    // warning, and an import map cannot change what a name means once something resolved it.
    const mapped = new Set(Object.keys(importMap.imports));
    const hashed = new Set(Object.keys(importMap.integrity));
    const updating = new Set<ModuleId>();

    /**
     * Registers what the live map has and this page lacks: the new version's hash, and shared library
     * versions it imports that no module here used before. Library names carry their version, so a new
     * version is a new name next to the old one, never a change to a name already resolved.
     */
    const addMissingEntries = () => {
        const imports = Object.fromEntries(Object.entries(latest.imports).filter(([name]) => !mapped.has(name) && !isModuleName(name)));
        const integrity = Object.fromEntries(Object.entries(latest.integrity).filter(([url]) => !hashed.has(url)));
        if (Object.keys(imports).length || Object.keys(integrity).length) {
            addImportMap({ imports, integrity });
            Object.keys(imports).forEach(name => mapped.add(name));
            Object.keys(integrity).forEach(url => hashed.add(url));
            $libraries.set([...$libraries.get(), ...librariesIn(imports)]);
            $libraryChunks.set(chunksIn(importMap, latest));
        }
    };

    const shell: ShellService = {
        $modules,
        $libraries,
        $libraryChunks,
        $autoUpdate,
        setAutoUpdate(on) {
            $autoUpdate.set(on);
            if (on) {
                void shell.checkForUpdates();
            }
        },
        start(id) {
            const region = regionOf(id);
            region.dataset.state = "loading";
            delete region.dataset.error;
            const version = versionOf(loadedFrom.get(id));
            if (version) {
                region.dataset.version = version;
            }
            return core.startModule(id, { props: { root: region } }).then(() => {
                region.dataset.state = "running";
                return true;
            }, err => {
                console.error(`"${id}" failed to start`, err);
                fail(id, err);
                return false;
            });
        },
        stop(id) {
            return core.stopModule(id).then(() => {
                regionOf(id).dataset.state = "stopped";
            });
        },
        async update(id) {
            const { source, update: url } = entryOf(id);
            if (!url || updating.has(id)) {
                return;
            }
            // "mfe/cart" already resolved to the old URL and cannot be remapped, so the new version is
            // loaded by URL, with its hash in an added import map. Where added maps are ignored, a
            // reload is the only way to keep the integrity check: the server renders the new map.
            mergesImportMaps ??= canAddImportMaps();
            if (!mergesImportMaps) {
                window.location.reload();
                return;
            }
            updating.add(id);
            try {
                addMissingEntries();
                const previous = factories.get(id)!;
                factories.set(id, remote(url));
                loadedFrom.set(id, url);
                // A module that crashed is started again: the new version may be the fix.
                const restart = isRunning(id) || regionOf(id).dataset.state === "failed";
                if (isRunning(id)) {
                    await shell.stop(id);
                }
                if (!restart || await shell.start(id)) {
                    patch(id, { source: url, update: undefined });
                    log(`updated ${id}: ${releaseOf(source)} → ${releaseOf(url)}`);
                    return;
                }
                factories.set(id, previous);
                loadedFrom.set(id, source);
                patch(id, { update: undefined, rejected: url });
                log(`${id} ${releaseOf(url)} failed to start; restoring ${releaseOf(source)}`);
                await shell.start(id);
            } finally {
                updating.delete(id);
            }
        },
        async checkForUpdates() {
            const response = await fetch("/importmap.json", { cache: "no-store" });
            if (!response.ok) {
                return;
            }
            latest = await response.json() as ImportMap;
            for (const entry of $modules.get()) {
                const url = latest.imports[specifierOf(entry.id)];
                const isNew = !!url && url !== entry.source && url !== entry.rejected;
                if (isNew !== !!entry.update || (isNew && url !== entry.update)) {
                    patch(entry.id, { update: isNew ? url : undefined });
                }
            }
            // Automatic swaps only where they keep the integrity check; elsewhere the button reloads instead.
            mergesImportMaps ??= canAddImportMaps();
            if ($autoUpdate.get() && mergesImportMaps) {
                for (const entry of $modules.get()) {
                    if (entry.update) {
                        await shell.update(entry.id);
                    }
                }
            }
        }
    };

    // Error boundary: an uncaught error thrown from a remote's own bundle stops that module and shows the
    // error in its region. The core cleans it up like any stop, and the other modules keep running.
    // shortcut: finds the module by its bundle URL in the stack, so errors thrown only inside framework code go unclaimed.
    const crashed = (err: unknown) => {
        const stack = err instanceof Error ? err.stack ?? "" : "";
        const id = [...loadedFrom].find(([, url]) => url && stack.includes(url))?.[0];
        if (!id || !isRunning(id)) {
            return;
        }
        log(`${id} ${releaseOf(loadedFrom.get(id)!)} crashed: ${messageOf(err)}; stopped it, the rest of the page keeps running`, "error");
        void shell.stop(id).then(() => fail(id, err));
    };
    window.addEventListener("error", event => crashed(event.error));
    window.addEventListener("unhandledrejection", event => crashed(event.reason));
    return shell;
}
