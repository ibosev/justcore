// Local stand-ins for production hosting: a CDN for the micro frontend bundles and the mock product API
// (cross-origin, with CORS like a real CDN), the shell's server, which renders the live import map
// into every page so a deploy never needs a shell rebuild, and a deployment console that picks the
// build each micro frontend runs.
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { cdnDir, listBuilds, mapPath, publishBuilds, readRecord } from "./scripts/deployments.mjs";
import { specifierOf } from "./scripts/importmap.mjs";

const here = resolve(import.meta.dirname);
const CDN_PORT = Number(process.env.CDN_PORT ?? 4400);
const SHELL_PORT = Number(process.env.SHELL_PORT ?? 4329);
const CONSOLE_PORT = Number(process.env.CONSOLE_PORT ?? 4330);
const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png"
};

async function fileFor(root, urlPath) {
    const path = normalize(join(root, decodeURIComponent(urlPath)));
    if (path !== root && !path.startsWith(root + sep)) {
        return undefined;
    }
    const info = await stat(path).catch(() => undefined);
    if (info?.isDirectory()) {
        return fileFor(root, join(urlPath, "index.html"));
    }
    return info?.isFile() ? path : undefined;
}

function send(res, path, headers) {
    res.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream", ...headers });
    createReadStream(path).pipe(res);
}

function serve(port, handler, host) {
    createServer((req, res) => {
        handler(new URL(req.url, "http://localhost").pathname, res, req).catch(err => {
            res.writeHead(500).end(String(err));
        });
    }).listen(port, host, () => console.info(`http://localhost:${port}`));
}

const roots = { cdn: cdnDir, api: join(here, "api"), shell: join(here, "shell/dist") };

// Read on every request: publishing a micro frontend changes this file, and the next page load sees it.
const liveImportMap = () => readFile(mapPath, "utf8").catch(() => {
    console.warn("deployments/importmap.json not found: run npm run build first");
    return JSON.stringify({ imports: {}, integrity: {} });
});

serve(CDN_PORT, async (urlPath, res) => {
    const [root, rest] = urlPath.startsWith("/api/") ? [roots.api, urlPath.slice(4)] : [roots.cdn, urlPath];
    const path = await fileFor(root, rest);
    if (!path) {
        res.writeHead(404, { "Access-Control-Allow-Origin": "*" }).end("not found");
        return;
    }
    // Content-hashed bundles never change; everything else (fragments, API data) must revalidate.
    const hashed = /-[\w-]{8,}\.js$/.test(path);
    send(res, path, {
        "Access-Control-Allow-Origin": "*",
        // Lets the shell's inspector read download sizes and tell cache hits from network loads.
        "Timing-Allow-Origin": "*",
        "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache"
    });
});

serve(SHELL_PORT, async (urlPath, res) => {
    if (urlPath === "/importmap.json") {
        // Polled by open pages to find newly deployed versions.
        res.writeHead(200, { "Content-Type": types[".json"], "Cache-Control": "no-store" }).end(await liveImportMap());
        return;
    }
    const path = await fileFor(roots.shell, urlPath) ?? (extname(urlPath) ? undefined : join(roots.shell, "index.html"));
    if (!path) {
        res.writeHead(404).end("not found");
        return;
    }
    if (path.endsWith(".html")) {
        // Escape "<" so the JSON cannot close the script element it is inlined into.
        const map = JSON.stringify(JSON.parse(await liveImportMap())).replaceAll("<", "\\u003c");
        const html = (await readFile(path, "utf8")).replace("__IMPORT_MAP__", () => map);
        res.writeHead(200, { "Content-Type": types[".html"], "Cache-Control": "no-cache" }).end(html);
        return;
    }
    send(res, path, { "Cache-Control": "no-cache" });
});

const json = (res, status, body) => res.writeHead(status, { "Content-Type": types[".json"], "Cache-Control": "no-store" }).end(JSON.stringify(body));

// shortcut: no authentication, so it listens on localhost only; a real console sits behind SSO and keeps an audit log.
serve(CONSOLE_PORT, async (urlPath, res, req) => {
    if (urlPath === "/api/builds" && req.method === "GET") {
        const builds = listBuilds();
        const { imports } = readRecord();
        const live = Object.fromEntries(Object.keys(builds).map(id => [id, imports[specifierOf(id)]?.split(`/${id}/`).pop()]));
        json(res, 200, { live, builds });
        return;
    }
    if (urlPath === "/api/publish" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) {
            body += chunk;
            if (body.length > 10_000) {
                json(res, 413, { error: "request too large" });
                return;
            }
        }
        let targets;
        try {
            ({ targets } = JSON.parse(body));
        } catch {
            json(res, 400, { error: "expected JSON with targets: [{ id, file }]" });
            return;
        }
        if (!Array.isArray(targets) || !targets.length) {
            json(res, 400, { error: "expected JSON with targets: [{ id, file }]" });
            return;
        }
        // Only builds the listing offers can be published: no paths from the request reach the file system unchecked.
        const builds = listBuilds();
        const unknown = targets.find(({ id, file }) => !builds[id]?.some(build => build.file === file));
        if (unknown) {
            json(res, 400, { error: `${unknown.id} has no build ${unknown.file} on the CDN` });
            return;
        }
        try {
            // One record write for all targets, so open pages pick the whole release up in the same check.
            const lines = await publishBuilds(targets.map(({ id, file }) => ({ id, file })));
            json(res, 200, { lines });
        } catch (err) {
            json(res, 422, { error: err.message });
        }
        return;
    }
    if (urlPath === "/" || urlPath === "/index.html") {
        send(res, join(here, "console/index.html"), { "Cache-Control": "no-cache" });
        return;
    }
    res.writeHead(404).end("not found");
}, "127.0.0.1");

console.info(`CDN and mock API on port ${CDN_PORT}, shell on port ${SHELL_PORT}, deployment console on port ${CONSOLE_PORT}`);
