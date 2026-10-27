import { Core } from "justcore";
import { inspector } from "../modules/inspector/index.ts";
import { createInspector } from "./inspector.ts";
import { createLocation } from "./location.ts";
import { moduleInfo } from "./registry.ts";
import { createSharedState } from "./shared.ts";
import { createShell, type ImportMap } from "./shell.ts";
import "./types.ts";

const UPDATE_CHECK_MS = 5000;

// Rendered into the page by the shell's server from the live deployment record.
const importMap: ImportMap = JSON.parse(document.querySelector("script[type=importmap]")?.textContent ?? "{}");

const core = new Core();
const recorder = createInspector();
core.use([recorder.extension]);

const shell = createShell(core, {
    importMap,
    // Kept here so the browser resolves names such as "mfe/cart" through this page's import map.
    importModule: specifier => import(/* @vite-ignore */ specifier),
    local: { inspector: inspector as jc.ModuleFactory },
    // On for the demonstration; chapter 8 of the docs weighs it against safer policies.
    autoUpdate: true,
    log: (label, kind = "lifecycle") => recorder.record(kind, label)
});

// Shared state: the URL plus owner-declared values. Modules reach it only through their sandbox.
core.serviceLocator.addService("location", () => createLocation());
core.serviceLocator.addService("shared", () => createSharedState());
core.serviceLocator.addService("inspector", () => recorder.service);
core.serviceLocator.addService("shell", () => shell);

core.init(() => {
    // All remotes download in parallel; each region shows its own loading or failed state.
    for (const { id } of moduleInfo) {
        void shell.start(id);
    }
    // shortcut: polls every few seconds; a production shell would use a long interval, ETag or a push channel.
    setInterval(() => void shell.checkForUpdates().catch(() => undefined), UPDATE_CHECK_MS);
});
