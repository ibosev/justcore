import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { defineConfig } from "vite";
import { libraries, libraryOf, packageJson, specifierOf } from "./libraries.mjs";

const here = import.meta.dirname;
const vendorDir = resolve(here, "../cdn/vendor");
// Built here first, then copied into vendorDir under content-hashed names (see writeLibraries).
const outDir = join(vendorDir, ".next");
const require = createRequire(join(here, "package.json"));
// CommonJS packages pick their build from NODE_ENV when required below, to list their exports.
process.env.NODE_ENV = "production";

// Every installed dependency that is a shared library, by the folder it is installed in. An npm alias
// such as "solid-js-1.9.18": "npm:solid-js@1.9.18" adds a second version next to the first.
const sources = {};
const installs = [];
for (const folder of Object.keys(JSON.parse(readFileSync(join(here, "package.json"), "utf8")).dependencies)) {
    const { name, version, dir } = packageJson(folder, here);
    installs.push({ folder, name, version, dir });
    for (const entry of libraries[name]?.entries ?? []) {
        const { commonjs, file } = libraries[name];
        const path = file ? `${folder}/${file}` : `${folder}${entry.slice(1)}`;
        // A CommonJS module's exports are only known at run time, so list them for the ES module wrapper.
        const names = commonjs && Object.keys(require(path)).filter(key => key !== "default" && key !== "__esModule");
        sources[specifierOf(name, version, entry)] = commonjs
            ? `import lib from "${path}";\nexport default lib;\nexport const { ${names.join(", ")} } = lib;\n`
            : `export * from "${path}";\n`;
    }
}

/**
 * Renames every file after a hash of its final bytes and records the build in libraries.json: each import
 * map name, its entry file, and every file it loads, for integrity. Rolldown's [hash] does not cover the
 * names of the chunks a file imports, so two builds could give different contents the same name. Hashing
 * the final bytes, dependencies first, means a URL never changes meaning, and a file that did not change
 * keeps its URL, and its place in browser caches, across builds.
 */
const writeLibraries = () => ({
    name: "showcase-vendor-libraries",
    writeBundle(_, bundle) {
        const final = new Map();
        const rename = (file, visiting = new Set()) => {
            if (final.has(file)) {
                return final.get(file);
            }
            if (visiting.has(file)) {
                throw new Error(`circular chunk imports through ${file}`);
            }
            visiting.add(file);
            const chunk = bundle[file];
            let code = readFileSync(join(outDir, file), "utf8");
            for (const dependency of [...chunk.imports, ...chunk.dynamicImports]) {
                code = code.replaceAll(basename(dependency), basename(rename(dependency, visiting)));
            }
            // "web-DYYN9VQq.js" becomes "web-<hash of these bytes>.js".
            const name = `${file.slice(0, -"-12345678.js".length)}-${createHash("sha256").update(code).digest("base64url").slice(0, 8)}.js`;
            const target = join(vendorDir, name);
            if (!existsSync(target)) {
                mkdirSync(dirname(target), { recursive: true });
                writeFileSync(target, code);
            }
            final.set(file, name);
            return name;
        };
        const closure = (file, seen = new Set()) => {
            seen.add(file);
            for (const next of [...bundle[file].imports, ...bundle[file].dynamicImports]) {
                if (!seen.has(next)) {
                    closure(next, seen);
                }
            }
            return [...seen];
        };
        const path = join(vendorDir, "libraries.json");
        // Earlier builds stay on the CDN for bundles and pages that still use them, so keep their records.
        const record = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
        for (const chunk of Object.values(bundle)) {
            if (chunk.type === "chunk" && chunk.isEntry) {
                record[chunk.name] = { file: rename(chunk.fileName), files: closure(chunk.fileName).map(file => rename(file)) };
            }
        }
        writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
        rmSync(outDir, { recursive: true });
    }
});

export default defineConfig({
    plugins: [
        {
            // Inside an aliased version, "solid-js" must mean that same version, not the one installed
            // under the plain name; likewise for sibling packages released together, such as @angular/*.
            name: "showcase-vendor-aliases",
            enforce: "pre",
            resolveId(source, importer) {
                const from = importer && installs.find(install => importer.startsWith(install.dir + sep));
                const library = from && from.folder !== from.name && libraryOf(source);
                const target = library && installs.find(install => install.name === library.name && install.version === from.version);
                return target ? this.resolve(target.folder + source.slice(library.name.length), join(here, "package.json")) : null;
            }
        },
        {
            name: "showcase-vendor-entries",
            resolveId: id => id.startsWith("\0vendor:") ? id : null,
            load: id => id.startsWith("\0vendor:") ? sources[id.slice("\0vendor:".length)] : null
        },
        {
            // Angular publishes partially compiled packages; its linker finishes them, so pages need no JIT compiler.
            name: "showcase-angular-linker",
            async transform(code, id) {
                if (!/[\\/]@angular[\\/]/.test(id) || !code.includes("ɵɵngDeclare")) {
                    return null;
                }
                const [{ transformAsync }, { default: linker }] = await Promise.all([
                    import("@babel/core"),
                    import("@angular/compiler-cli/linker/babel")
                ]);
                const result = await transformAsync(code, { filename: id, plugins: [linker], babelrc: false, configFile: false, compact: false });
                return result?.code;
            }
        },
        writeLibraries()
    ],
    define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
        // Angular's production flags, as its CLI sets them. Without them Angular runs its development checks.
        ngDevMode: "false",
        ngJitMode: "false",
        ngI18nClosureMode: "false",
        ngServerMode: "false"
    },
    build: {
        outDir,
        // Only the staging folder is emptied; files of earlier builds stay for bundles that still import them.
        emptyOutDir: true,
        copyPublicDir: false,
        rolldownOptions: {
            input: Object.fromEntries(Object.keys(sources).map(specifier => [specifier, `\0vendor:${specifier}`])),
            // Keep every export: the consumers are other bundles, built and deployed separately.
            preserveEntrySignatures: "strict",
            output: { entryFileNames: "[name]-[hash].js", chunkFileNames: "chunks/[name]-[hash].js", minify: true }
        }
    }
});
