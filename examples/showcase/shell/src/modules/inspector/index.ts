import type { ShowcaseModuleFactory } from "@showcase/contracts";
import type { ModuleId } from "../../app/registry.ts";
import { versionOf, type ModuleEntry } from "../../app/shell.ts";
import "../../app/types.ts";

type Child = Node | string | false | undefined;

/** Creates an element. Text is set as text, never parsed as HTML, so values from the record cannot inject markup. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: Child[]) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children.filter((child): child is Node | string => child !== false && child !== undefined));
    return node;
}

const fileOf = (url: string) => url.split("/").pop() ?? url;
const kilobytes = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

/**
 * The shell's own module, bundled with the shell and written without a framework, so the shell ships
 * none: it renders what the inspector extension records and drives the shell service.
 */
export const inspector: ShowcaseModuleFactory = sandbox => ({
    sandbox,
    init(props) {
        if (!props?.root) {
            throw new Error("module started without a root element");
        }
        const root = props.root;
        const { signal } = sandbox;
        const recorder = sandbox.getService("inspector");
        const shell = sandbox.getService("shell");
        let busy: ModuleId | undefined;

        const run = (id: ModuleId, action: Promise<unknown>) => {
            busy = id;
            renderModules();
            void action.finally(() => {
                busy = undefined;
                renderModules();
            });
        };
        const download = (url: string) => {
            const file = recorder.$downloads.get()[url];
            if (!file) {
                return "not loaded";
            }
            // Without the CDN's Timing-Allow-Origin header the browser reports zeros.
            if (!file.size) {
                return "loaded";
            }
            return `${kilobytes(file.size)} · ${file.transferred === 0 ? "cache" : "network"}`;
        };
        const isRunning = (id: string) => !!recorder.$running.get()[id]?.length;
        const release = (url: string) => versionOf(url) ?? fileOf(url);

        const moduleRow = (entry: ModuleEntry) => {
            const remote = entry.source.startsWith("http");
            const running = isRunning(entry.id);
            const status = el("span", { className: "status", textContent: running ? "running" : "stopped" });
            status.dataset.running = String(running);
            const toggle = el("button", {
                type: "button",
                className: "secondary",
                textContent: running ? "Stop" : "Start",
                disabled: entry.id === sandbox.moduleId || busy === entry.id,
                title: entry.id === sandbox.moduleId ? "The inspector cannot stop itself" : ""
            });
            toggle.addEventListener("click", () => run(entry.id, running ? shell.stop(entry.id) : shell.start(entry.id)));
            const update = entry.update ? el("button", {
                type: "button",
                className: "update",
                // A rebuild without a version bump has the same version, so name the file instead.
                textContent: `Update to ${versionOf(entry.update) !== versionOf(entry.source) ? release(entry.update) : fileOf(entry.update)}`,
                title: `Load ${entry.update}`,
                disabled: busy === entry.id
            }) : undefined;
            update?.addEventListener("click", () => run(entry.id, shell.update(entry.id)));
            return el("tr", {},
                el("td", { textContent: entry.id }),
                el("td", { textContent: entry.framework }),
                el("td", {}, el("strong", { className: "version", textContent: remote ? versionOf(entry.source) ?? "unversioned" : "with the shell" })),
                el("td", {},
                    el("code", { title: entry.source, textContent: remote ? fileOf(entry.source) : "shell" }),
                    remote && el("span", { className: "size", textContent: download(entry.source) }),
                    entry.rejected && el("span", { className: "rejected", textContent: `${release(entry.rejected)} failed to start, kept this version` })),
                el("td", {}, status),
                el("td", {}, toggle, update));
        };

        const autoUpdate = el("input", { type: "checkbox" });
        autoUpdate.addEventListener("change", () => shell.setAutoUpdate(autoUpdate.checked));
        const modulesBody = el("tbody");
        const librariesBody = el("tbody");
        const events = el("ol", { className: "events" });
        const table = (headings: string[], body: HTMLElement) => el("div", { className: "inspector__scroll" },
            el("table", { className: "modules" }, el("thead", {}, el("tr", {}, ...headings.map(text => el("th", { textContent: text })))), body));

        const renderModules = () => modulesBody.replaceChildren(...shell.$modules.get().map(moduleRow));
        const renderLibraries = () => {
            const chunks = shell.$libraryChunks.get();
            const loaded = chunks.map(url => recorder.$downloads.get()[url]).filter(file => !!file?.size);
            const chunkSummary = loaded.length
                ? `${kilobytes(loaded.reduce((sum, file) => sum + file!.size, 0))} · ${loaded.some(file => file!.transferred > 0) ? "network" : "cache"}`
                : "not loaded";
            const rows = shell.$libraries.get().map(library => el("tr", {},
                el("td", {}, el("code", { title: library.url, textContent: library.name })),
                el("td", {}, el("span", { className: "size", textContent: download(library.url) }))));
            librariesBody.replaceChildren(...(rows.length ? rows : [el("tr", {}, el("td", { className: "empty", colSpan: 2, textContent: "No shared libraries in the import map." }))]),
                ...(chunks.length ? [el("tr", {},
                    el("td", { textContent: `${chunks.length} chunks the libraries share, such as framework internals` }),
                    el("td", {}, el("span", { className: "size", textContent: chunkSummary })))] : []));
        };
        const renderEvents = () => {
            const list = recorder.$events.get();
            events.replaceChildren(...(list.length ? list.map(event => {
                const item = el("li", { className: "event" },
                    el("time", { textContent: event.time }),
                    el("span", { className: "event__label", textContent: event.label }),
                    event.detail && el("code", { textContent: event.detail }));
                item.dataset.kind = event.kind;
                return item;
            }) : [el("li", { className: "empty", textContent: "Nothing yet." })]));
        };

        root.replaceChildren(el("div", { className: "inspector" },
            el("section", {},
                el("h2", { textContent: "Modules" }),
                el("p", { className: "hint", textContent: "Stop the cart, then add a product: the request goes out on the bus, but nobody handles it. Start the cart again and it reloads its contents from its own backend. When a team publishes a new version, the shell swaps it in without a page load, or offers a button when automatic updates are off." }),
                el("label", { className: "toggle" }, autoUpdate, "Apply new deployments automatically"),
                table(["Module", "Framework", "Version", "Loaded from", "State", ""], modulesBody),
                el("h2", { className: "inspector__subhead", textContent: "Shared libraries" }),
                el("p", { className: "hint", textContent: "Framework code is not bundled into the micro frontends. Each library version is one immutable file on the CDN, loaded once per page, cached across reloads and deploys, and shared by every bundle built against it." }),
                table(["Library", "Loaded"], librariesBody)),
            el("section", {},
                el("h2", { textContent: "Message bus and lifecycle" }),
                events)));

        const stops = [
            shell.$modules.listen(renderModules),
            recorder.$running.listen(renderModules),
            recorder.$downloads.listen(() => {
                renderModules();
                renderLibraries();
            }),
            shell.$libraries.listen(renderLibraries),
            shell.$libraryChunks.listen(renderLibraries),
            recorder.$events.listen(renderEvents),
            shell.$autoUpdate.subscribe(on => {
                autoUpdate.checked = on;
            })
        ];
        renderModules();
        renderLibraries();
        renderEvents();
        signal.addEventListener("abort", () => {
            stops.forEach(stop => stop());
            root.replaceChildren();
        }, { once: true });
    },
    destroy() {
        // Everything above is released by the signal.
    }
});
