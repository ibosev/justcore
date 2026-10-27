/** The import map name a remote is loaded by. Keep in sync with specifierOf in shell/src/app/registry.ts. */
export const specifierOf = id => `mfe/${id}`;

/**
 * Returns a new import map in which `id` points at `url`, plus the shared libraries that version imports.
 * The replaced version's hash is dropped so stale entries do not pile up. Library entries are kept: a
 * library name includes its version, so any build it points at is compatible, and other bundles may use it.
 * shortcut: unused library names and hashes are never removed; prune them against the live bundles if the map grows.
 */
export function publish(map, { id, url, integrity, libraries = { imports: {}, integrity: {} } }) {
    const previous = map.imports[specifierOf(id)];
    const imports = { ...map.imports, ...libraries.imports, [specifierOf(id)]: url };
    const hashes = { ...map.integrity, ...libraries.integrity, [url]: integrity };
    if (previous && previous !== url) {
        delete hashes[previous];
    }
    return { imports, integrity: hashes };
}

/**
 * The bare imports of a built bundle and the names it takes from each, e.g.
 * { "solid-js@1.9.17/web": Set { "render", "insert" } }. Relative and URL imports are skipped, and so are
 * the members of a namespace import, which cannot be listed.
 */
export function importedNames(parsed, source) {
    const names = {};
    for (const entry of parsed.filter(each => each.type === "static" && !/^(\.{0,2}\/|[a-z]+:)/.test(each.specifier))) {
        const statement = source.slice(entry.importStart, entry.importEnd);
        const taken = (names[entry.specifier] ??= new Set());
        if (/^import\s*[\w$]+\s*(,|from)/.test(statement)) {
            taken.add("default");
        }
        for (const item of statement.match(/\{([^}]*)\}/)?.[1].split(",") ?? []) {
            const name = item.trim().split(/\s+as\s+/)[0];
            if (name) {
                taken.add(name);
            }
        }
    }
    return names;
}

/** The names a module exports, or undefined if it re-exports a whole module and they cannot be listed. */
export function exportedNames(parsedExports) {
    return parsedExports.some(entry => entry.type === "reexport-all") ? undefined : new Set(parsedExports.map(entry => entry.name));
}
