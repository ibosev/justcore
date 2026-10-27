// Compile-only: proves the published declarations support typical consumer code.
import { Core, remoteModule } from "../../dist/types";

declare global {
    namespace jc {
        interface ServiceLocatorMap {
            clock: { now(): number };
        }
    }
}

interface SearchProps { root: string; }

interface SearchChanged extends jc.Message { type: "search.changed"; query: string; }

class SearchModule implements jc.Module<SearchProps> {
    constructor(public sandbox: jc.Sandbox) { }
    init(props?: SearchProps): void { this.sandbox.publishAsync({ type: "search.started", root: props?.root }); }
    moduleWillSubscribe(): string[] { return ["search.changed"]; }
    moduleDidReceiveMessage(message: SearchChanged): void { void message.query; }
    destroy(): void { void this.sandbox.getService("clock").now(); }
}

const asyncModule: jc.ModuleFactory = sandbox => ({
    sandbox,
    async init(): Promise<void> {
        document.addEventListener("click", () => sandbox.publishAsync({ type: "clicked" }), { signal: sandbox.signal });
        await fetch("/config", { signal: sandbox.signal });
    },
    destroy: async () => undefined
});

const lazyModule: jc.ModuleFactory = async sandbox => {
    // @ts-expect-error the core is reachable only from extensions, not from a module's sandbox
    void sandbox._extensionsOnlyCore;
    return { sandbox, init: () => undefined, destroy: () => undefined };
};

const logger: jc.Extension = {
    name: "logger",
    install: () => ({
        onModuleStart(next, id) { console.info(id); return next(); }
    })
};

const core = new Core();
core.use([logger]);
core.serviceLocator.addService("clock", () => ({ now: () => Date.now() }));
core.init(() => {
    core.addModule("search", sandbox => new SearchModule(sandbox));
    core.addModule("async", asyncModule);
    core.addModule("lazy", lazyModule);
    const cartUrl: string = "https://cdn.example.com/cart.3f2a9c.js";
    core.addModule("cart", remoteModule(() => import(/* @vite-ignore */ cartUrl)));
    core.startModule("search", { props: { root: "#search" } })
        .then(() => core.stopModule("search"), (err: unknown) => console.error("search failed to start", err));
});
