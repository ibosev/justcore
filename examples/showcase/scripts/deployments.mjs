// Stand-in for a deployment service: lists the builds on the CDN and moves pointers in the live import
// map. Used by scripts/publish.mjs on the command line and by the deployment console in serve.mjs.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { init, parse } from "es-module-lexer";
import { exportedNames, importedNames, publish, specifierOf } from "./importmap.mjs";

const here = resolve(import.meta.dirname, "..");
export const cdnDir = resolve(process.env.CDN_DIR ?? join(here, "cdn"));
export const cdnUrl = process.env.CDN_URL ?? "http://localhost:4400";
export const mapPath = resolve(process.env.IMPORT_MAP ?? join(here, "deployments/importmap.json"));

const hashOf = path => `sha384-${createHash("sha384").update(readFileSync(path)).digest("base64")}`;
const readJson = (path, fallback) => existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;

export const readRecord = () => readJson(mapPath, { imports: {}, integrity: {} });

/** Orders "1.10.0" after "1.9.2"; release versions only, which is what the builds use. */
export const compareVersions = (a, b) => {
    const [x, y] = [a, b].map(version => version.split(/[.-]/).map(Number));
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if ((x[i] ?? 0) !== (y[i] ?? 0)) {
            return (x[i] ?? 0) - (y[i] ?? 0);
        }
    }
    return 0;
};

/** Every build of every micro frontend on the CDN, newest version first: { cart: [{ file, version, builtAt }] }. */
export function listBuilds() {
    const builds = {};
    for (const id of readdirSync(cdnDir).filter(name => name !== "vendor" && statSync(join(cdnDir, name)).isDirectory()).sort()) {
        const versions = readdirSync(join(cdnDir, id)).filter(name => /^\d+\.\d+\.\d+/.test(name));
        builds[id] = versions.flatMap(version => readdirSync(join(cdnDir, id, version))
            .filter(file => file.endsWith(".js"))
            .map(file => ({ file: `${version}/${file}`, version, builtAt: statSync(join(cdnDir, id, version, file)).mtime.toISOString() })))
            .sort((a, b) => compareVersions(b.version, a.version) || b.builtAt.localeCompare(a.builtAt));
    }
    return builds;
}

const lastBuilt = id => {
    const manifest = readJson(join(cdnDir, id, ".vite/manifest.json"), {});
    const entry = Object.values(manifest).find(chunk => chunk.isEntry);
    if (!entry) {
        throw new Error(`no build of ${id} found`);
    }
    return entry.file;
};

/**
 * The import map entries and hashes for the shared libraries one bundle imports, from the latest vendor
 * build. Vendor files are named by their content, so files that did not change keep their URLs.
 * Refuses a bundle that needs a library the CDN lacks, or a name its version does not export: a bundle
 * compiled by a newer framework compiler than its runtime would otherwise fail in every browser.
 */
function librariesOf(label, source, vendor) {
    const libraries = { imports: {}, integrity: {} };
    for (const [name, taken] of Object.entries(importedNames(parse(source)[0], source))) {
        const library = vendor[name];
        if (!library) {
            throw new Error(`${label} imports ${name}, which the vendor build has not put on the CDN`);
        }
        const exported = exportedNames(parse(readFileSync(join(cdnDir, "vendor", library.file), "utf8"))[1]);
        const missing = exported ? [...taken].filter(each => !exported.has(each)) : [];
        if (missing.length) {
            throw new Error(`${label} imports ${missing.join(", ")} from ${name}, which that version does not export`);
        }
        libraries.imports[name] = `${cdnUrl}/vendor/${library.file}`;
        for (const file of library.files) {
            libraries.integrity[`${cdnUrl}/vendor/${file}`] = hashOf(join(cdnDir, "vendor", file));
        }
    }
    return libraries;
}

/**
 * Points each micro frontend at a build already on the CDN, the last one built when `file` is omitted,
 * and returns one line per change. All targets are checked before the record is written, and the record
 * is replaced in one rename, so readers see the old map or the new one, never half of either.
 */
export async function publishBuilds(targets) {
    await init;
    // Written by the vendor build: each library name, its entry file and every file that entry loads.
    const vendor = readJson(join(cdnDir, "vendor/libraries.json"), {});
    let map = readRecord();
    const lines = [];
    for (const { id, file = lastBuilt(id) } of targets) {
        const path = join(cdnDir, id, file);
        if (!/^[\w-]+$/.test(id) || !resolve(path).startsWith(join(cdnDir, id) + "/") || !existsSync(path)) {
            throw new Error(`${id}/${file} is not on the CDN`);
        }
        const libraries = librariesOf(`${id}/${file}`, readFileSync(path, "utf8"), vendor);
        const previous = map.imports[specifierOf(id)];
        map = publish(map, { id, url: `${cdnUrl}/${id}/${file}`, integrity: hashOf(path), libraries });
        lines.push(`${id}: ${previous ? previous.slice(`${cdnUrl}/${id}/`.length) : "(new)"} -> ${file}`);
    }
    mkdirSync(resolve(mapPath, ".."), { recursive: true });
    writeFileSync(`${mapPath}.tmp`, JSON.stringify(map, null, 2) + "\n");
    renameSync(`${mapPath}.tmp`, mapPath);
    return lines;
}
