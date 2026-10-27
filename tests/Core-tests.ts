import { Sandbox } from "../src/components/Sandbox";
import { Core } from "../src/components/Core";
import { ServiceLocator } from "../src/components/ServiceLocator";

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** Installs the given plugins on a core that is not initialized yet. */
function usePlugins(core: jc.Core, plugins: Partial<Record<jc.HookType, jc.Func>>): void {
    core.use([{ name: "test-plugins", install: () => plugins as Partial<jc.PluginsMap> }]);
}

interface TestsContext {
    core: jc.Core;
    module: {
        id: string;
        sandbox: jc.Sandbox;
        init(options?: jc.ModuleStartOptions): void;
        moduleDidReceiveProps(nextProps: {}): void;
        destroy(): void;
    };
    moduleFactory: jc.ModuleFactory;
    moduleStartOptions: jc.ModuleStartOptions;
}

describe("Core", () => {

    beforeEach(function (this: TestsContext): void {
        spyOn(console, "error");
        this.core = new Core();
        this.module = {
            id: "test-module",
            sandbox: null,
            init: () => true,
            moduleDidReceiveProps: (nextProps: {}) => false,
            destroy: () => true,
        };
        this.moduleFactory = (sb: jc.Sandbox) => {
            this.module.sandbox = sb;
            return this.module;
        };
        this.moduleStartOptions = {
            instanceId: "test-instance",
            props: {
                today: new Date().getMilliseconds()
            }
        };
    });

    describe("Initialization", () => {
        it(`should use project's version as version prop`, function (this: TestsContext) {
            expect(typeof this.core.version).toEqual("string");
            expect(this.core.version.split(".").length).toEqual(3);
        });

        it("should have no extensions installed by default", function (this: TestsContext) {
            expect(this.core.extensions).toEqual([]);
        });

        it("should throw when init in already initialized state", function (this: TestsContext) {
            this.core.init();

            expect(() => this.core.init()).toThrowError();
        });

        it("should execute a callback on init", function (this: TestsContext, done: DoneFn) {
            const onInit = spyOn({ callback: () => true }, "callback");

            this.core.init(onInit);

            setTimeout(() => {
                expect(onInit).toHaveBeenCalledTimes(1);
                done();
            }, 10);
        });

        it("should create a hook that runs the plugins of its type", function (this: TestsContext) {
            const calls: string[] = [];
            usePlugins(this.core, { onCoreInit: (next: jc.Func) => { calls.push("plugin"); return next(); } });
            this.core.init();
            const hook = this.core.createHook("onCoreInit", () => { calls.push("method"); });

            hook();

            expect(calls).toEqual(["plugin", "method"]);
        });

        it("should run onCoreInit plugins around the init callback", async function (this: TestsContext) {
            const calls: string[] = [];
            usePlugins(this.core, { onCoreInit: function (this: jc.Core, next: jc.Func) { calls.push("plugin"); return next(); } });

            this.core.init(() => { calls.push("callback"); });
            await tick();

            expect(calls).toEqual(["plugin", "callback"]);
        });

        it("should run each core method through its hook", function (this: TestsContext) {
            const seen: unknown[][] = [];
            const record = (hook: string) => function (this: jc.Core, next: jc.Func, ...args: unknown[]): unknown {
                seen.push([hook, this, args[0]]);
                return next();
            };
            usePlugins(this.core, {
                onModuleAdd: record("onModuleAdd"),
                onModuleStart: record("onModuleStart"),
                onModuleStop: record("onModuleStop"),
                onMessageSubscribe: record("onMessageSubscribe"),
                onMessagePublish: record("onMessagePublish")
            });
            this.core.init();
            const message: jc.Message = { type: "message" };

            this.core.addModule(this.module.id, this.moduleFactory);
            this.core.startModule(this.module.id);
            this.core.stopModule(this.module.id);
            this.core.onMessage("message", () => undefined);
            this.core.publishAsync(message);

            expect(seen).toEqual([
                ["onModuleAdd", this.core, this.module.id],
                ["onModuleStart", this.core, this.module.id],
                ["onModuleStop", this.core, this.module.id],
                ["onMessageSubscribe", this.core, "message"],
                ["onMessagePublish", this.core, message]
            ]);
        });

        it("should has default service locator implementation", function (this: TestsContext) {
            expect(this.core.serviceLocator).toBeInstanceOf(ServiceLocator);
        });
    });

    describe("Modules", () => {
        it("should list registered modules as empty array in zero state", function (this: TestsContext) {
            const modules = this.core.modules;

            expect(Array.isArray(modules)).toBeTruthy();
            expect(modules.length).toEqual(0);
        });

        it("should list running modules as empty object in zero state", function (this: TestsContext) {
            const modules = this.core.runningModules;

            expect(typeof modules).toEqual("object");
            expect(Object.keys(modules).length).toEqual(0);
        });

        it("should throw when add a module with invalid arguments", function (this: TestsContext) {
            const cases = [
                () => { this.core.addModule("", this.moduleFactory); },
                () => { this.core.addModule(null, this.moduleFactory); },
                () => { this.core.addModule(undefined, this.moduleFactory); },
                () => { this.core.addModule(this.module.id, null); }
            ];

            cases.forEach(test => expect(test).toThrowError());
        });

        it("should add a module", function (this: TestsContext) {
            this.core.addModule(this.module.id, this.moduleFactory);
            const modules = this.core.modules;
            const runningModules = this.core.runningModules;

            expect(modules.length).toEqual(1);
            expect(Object.keys(runningModules).length).toEqual(1);
            expect(runningModules[this.module.id].length).toEqual(0);
            expect(modules[0]).toEqual(this.module.id);
        });

        it("should throw when add an already registered module", function (this: TestsContext) {
            this.core.addModule(this.module.id, this.moduleFactory);

            expect(() => this.core.addModule(this.module.id, this.moduleFactory)).toThrowError();
        });

        it("should throw when start module in not initialized state", function (this: TestsContext) {
            this.core.addModule(this.module.id, this.moduleFactory);

            expect(() => this.core.startModule(this.module.id)).toThrowError();
            expect(Object.keys(this.core.runningModules[this.module.id]).length).toEqual(0);
        });

        it("should throw when start not added module", function (this: TestsContext) {
            this.core.init();

            expect(() => this.core.startModule(this.module.id)).toThrowError();
        });

        it("should start a module", function (this: TestsContext) {
            const init = spyOn(this.module, "init");
            this.core.init();
            this.core.addModule(this.module.id, this.moduleFactory);

            this.core.startModule(this.module.id);

            expect(init).toHaveBeenCalledTimes(1);
            const runningModuls = this.core.runningModules;
            expect(Object.keys(runningModuls).length).toEqual(1);
            expect(runningModuls[this.module.id][0]).toEqual(this.module.id);
        });

        it("should run onModuleInit plugins with the module as context", function (this: TestsContext) {
            const seen: unknown[] = [];
            usePlugins(this.core, { onModuleInit: function (this: jc.Module, next: jc.Func, props: {}) { seen.push(this, props); return next(); } });
            this.core.init();
            this.core.addModule(this.module.id, this.moduleFactory);
            const init = spyOn(this.module, "init");

            this.core.startModule(this.module.id, this.moduleStartOptions);

            expect(seen).toEqual([this.module, this.moduleStartOptions.props]);
            expect(init).toHaveBeenCalledTimes(1);
            expect(init).toHaveBeenCalledWith(this.moduleStartOptions.props);
            expect(init.calls.first().object).toBe(this.module);
        });

        it("should provide a sandbox in the module factory", function (this: TestsContext) {
            const moduleFactory = spyOn(this, "moduleFactory").and.callThrough();
            this.core.init();
            this.core.addModule(this.module.id, this.moduleFactory);

            this.core.startModule(this.module.id, this.moduleStartOptions);

            const sandbox = moduleFactory.calls.first().args[0];
            expect(sandbox instanceof this.core.Sandbox).toEqual(true);
            expect(sandbox instanceof Sandbox).toEqual(true);
        });

        it("should give each core its own Sandbox class", function (this: TestsContext) {
            const other = new Core();

            (this.core.Sandbox.prototype as any).extra = () => true;

            expect(other.Sandbox).not.toBe(this.core.Sandbox);
            expect((other.Sandbox.prototype as any).extra).toBeUndefined();
        });

        it("should be able to start another module instance", function (this: TestsContext) {
            const init = spyOn(this.module, "init");
            this.core.init();
            this.core.addModule(this.module.id, this.moduleFactory);

            this.core.startModule(this.module.id);
            this.core.startModule(this.module.id, this.moduleStartOptions);

            expect(init).toHaveBeenCalledTimes(2);
        });

        it("should provide custom props to a module when start", function (this: TestsContext) {
            const init = spyOn(this.module, "init");
            this.core.init();
            this.core.addModule(this.module.id, this.moduleFactory);

            this.core.startModule(this.module.id, this.moduleStartOptions);

            expect(init).toHaveBeenCalledWith(this.moduleStartOptions.props);
        });

        it("should provide undefined as custom props when start without props option", function (this: TestsContext) {
            const init = spyOn(this.module, "init");
            this.core.init();
            this.core.addModule(this.module.id, this.moduleFactory);

            this.core.startModule(this.module.id);

            expect(init).toHaveBeenCalledWith(undefined);
        });

        it("should run onModuleReceiveProps plugins when start an already started module", function (this: TestsContext) {
            const seen: unknown[] = [];
            usePlugins(this.core, { onModuleReceiveProps: function (this: jc.Module, next: jc.Func, props: {}) { seen.push(this, props); return next(); } });
            this.core.init();
            this.core.addModule(this.module.id, this.moduleFactory);
            this.core.startModule(this.module.id, this.moduleStartOptions);
            const moduleDidReceiveProps = spyOn(this.module, "moduleDidReceiveProps");

            this.core.startModule(this.module.id, this.moduleStartOptions);

            expect(seen).toEqual([this.module, this.moduleStartOptions.props]);
            expect(moduleDidReceiveProps).toHaveBeenCalledTimes(1);
            expect(moduleDidReceiveProps).toHaveBeenCalledWith(this.moduleStartOptions.props);
            expect(moduleDidReceiveProps.calls.first().object).toBe(this.module);
        });

        it("should not call module init when start an already started module", function (this: TestsContext) {
            this.core.init();
            this.core.addModule(this.module.id, this.moduleFactory);
            this.core.startModule(this.module.id);
            const init = spyOn(this.module, "init");

            this.core.startModule(this.module.id, this.moduleStartOptions.props);

            expect(init).toHaveBeenCalledTimes(0);
        });

        it("should not call moduleDidReceiveProps when start an already started module and hook is not defined", function (this: TestsContext) {
            const plugin = jasmine.createSpy("onModuleReceiveProps");
            usePlugins(this.core, { onModuleReceiveProps: plugin });
            this.core.init();
            this.core.addModule(this.module.id, this.moduleFactory);
            this.core.startModule(this.module.id);
            this.module.moduleDidReceiveProps = null;

            this.core.startModule(this.module.id, this.moduleStartOptions.props);

            expect(plugin).not.toHaveBeenCalled();
        });

        it("should reject without throwing when start a module and its factory throws", async function (this: TestsContext) {
            const moduleFactory = spyOn(this, "moduleFactory").and.throwError("factory failed");
            const init = spyOn(this.module, "init");
            this.core.init();
            this.core.addModule(this.module.id, this.moduleFactory);

            let starting: Promise<void>;
            expect(() => { starting = this.core.startModule(this.module.id); }).not.toThrowError();
            await expectAsync(starting).toBeRejectedWithError("factory failed");
            expect(moduleFactory).toHaveBeenCalledTimes(1);
            expect(init).toHaveBeenCalledTimes(0);
            expect(this.core.runningModules[this.module.id]).toEqual([]);
        });

        it("should reject without throwing when start a module and its initialization throws", async function (this: TestsContext) {
            const init = spyOn(this.module, "init").and.throwError("init failed");
            this.core.init();
            this.core.addModule(this.module.id, this.moduleFactory);

            let starting: Promise<void>;
            expect(() => { starting = this.core.startModule(this.module.id); }).not.toThrowError();
            await expectAsync(starting).toBeRejectedWithError("init failed");
            expect(init).toHaveBeenCalledTimes(1);
            expect(this.core.runningModules[this.module.id]).toEqual([]);
        });

        it("should start a module whose factory resolves later", async function (this: TestsContext) {
            this.core.init();
            this.core.addModule(this.module.id, sandbox => Promise.resolve(this.moduleFactory(sandbox)));

            const starting = this.core.startModule(this.module.id);
            expect(this.core.runningModules[this.module.id]).toEqual([]);
            await starting;

            expect(this.core.runningModules[this.module.id]).toEqual([this.module.id]);
        });

        it("should reject when the factory does not return a valid module", async function (this: TestsContext) {
            const cases: jc.ModuleFactory[] = [
                () => null,
                () => Promise.resolve(undefined),
                () => ({ sandbox: new Sandbox(this.core, "other", "other"), init: () => undefined, destroy: () => undefined }),
                sandbox => ({ sandbox, init: null, destroy: () => undefined }),
                sandbox => ({ sandbox, init: () => undefined, destroy: null })
            ];
            this.core.init();

            for (const [index, factory] of cases.entries()) {
                this.core.addModule(`m${index}`, factory);
                await expectAsync(this.core.startModule(`m${index}`)).toBeRejected();
                expect(this.core.runningModules[`m${index}`]).toEqual([]);
            }
        });

        it("should resolve a stop requested while the start fails", async function (this: TestsContext) {
            spyOn(this.module, "init").and.callFake((() => Promise.reject(new Error("init failed"))) as any);
            this.core.init();
            this.core.addModule(this.module.id, this.moduleFactory);
            const starting = this.core.startModule(this.module.id);

            await expectAsync(this.core.stopModule(this.module.id)).toBeResolved();
            await expectAsync(starting).toBeRejectedWithError("init failed");
        });

        it("should not throw when stop a not registered module", function (this: TestsContext) {
            expect(() => this.core.stopModule(this.module.id)).not.toThrowError();
        });

        it("should not throw when stop a not running module", function (this: TestsContext) {
            this.core.addModule(this.module.id, this.moduleFactory);

            expect(() => this.core.stopModule(this.module.id)).not.toThrowError();
        });

        it("should stop a module", function (this: TestsContext) {
            const destroy = spyOn(this.module, "destroy");
            this.core.init();
            this.core.addModule(this.module.id, this.moduleFactory);
            this.core.startModule(this.module.id);

            this.core.stopModule(this.module.id);

            expect(destroy).toHaveBeenCalledTimes(1);
        });

        it("should stop a module with more than one running instance", function (this: TestsContext) {
            const destroy = spyOn(this.module, "destroy");
            this.core.init();
            this.core.addModule(this.module.id, this.moduleFactory);
            this.core.startModule(this.module.id);
            this.core.startModule(this.module.id, this.moduleStartOptions);

            this.core.stopModule(this.module.id, this.moduleStartOptions.instanceId);

            expect(destroy).toHaveBeenCalledTimes(1);
            expect
        });

        it("should run onModuleDestroy plugins with the module as context when stop a module", function (this: TestsContext) {
            const seen: unknown[] = [];
            usePlugins(this.core, { onModuleDestroy: function (this: jc.Module, next: jc.Func) { seen.push(this); return next(); } });
            this.core.init();
            this.core.addModule(this.module.id, this.moduleFactory);
            this.core.startModule(this.module.id, this.moduleStartOptions);
            const destroy = spyOn(this.module, "destroy");

            this.core.stopModule(this.module.id, this.moduleStartOptions.instanceId);

            expect(seen).toEqual([this.module]);
            expect(destroy).toHaveBeenCalledTimes(1);
            expect(destroy.calls.first().object).toBe(this.module);
        });

        it("should not throw and should untrack the instance when stop a module and its destroy throws", function (this: TestsContext) {
            const destroy = spyOn(this.module, "destroy").and.throwError("");
            this.core.init();
            this.core.addModule(this.module.id, this.moduleFactory);
            this.core.startModule(this.module.id);

            expect(() => this.core.stopModule(this.module.id)).not.toThrowError();
            expect(destroy).toHaveBeenCalledTimes(1);
            expect(this.core.runningModules[this.module.id]).toEqual([]);
        });
    });

    describe("MessageBus", () => {
        it("should deliver a published message to its subscribers asynchronously", async function (this: TestsContext) {
            const handler = jasmine.createSpy("handler");
            const message: jc.Message = { type: "message" };
            this.core.onMessage("message", handler);

            this.core.publishAsync(message);
            expect(handler).not.toHaveBeenCalled();
            await tick();

            expect(handler).toHaveBeenCalledOnceWith(message);
        });

        it("should stop delivering after unsubscribe", async function (this: TestsContext) {
            const handler = jasmine.createSpy("handler");
            const unsubscribe = this.core.onMessage("message", handler);

            unsubscribe();
            this.core.publishAsync({ type: "message" });
            await tick();

            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe("Extensions", () => {
        it("should throw when extensions are not an array", function (this: TestsContext) {
            expect(() => this.core.use(null)).toThrowError();
        });

        it("should throw when use an extension after init", function (this: TestsContext) {
            this.core.init();

            expect(() => this.core.use([])).toThrowError();
        });

        it("should throw when extension is not an object", function (this: TestsContext) {
            expect(() => this.core.use([null])).toThrowError();
        });

        it("should not throw when extension install doesn't return plugins", function (this: TestsContext) {
            const extension: jc.Extension = {
                name: "test",
                install: () => undefined
            };
            const install = spyOn(extension, "install");

            this.core.use([extension]);
            this.core.init();

            expect(install).toHaveBeenCalledTimes(1);
        });

        it("should throw when extension name is empty", function (this: TestsContext) {
            const extension: jc.Extension = {
                name: "",
                install: () => undefined
            };
            expect(() => this.core.use([extension])).toThrowError();
        });

        it("should throw when extension install is not a function", function (this: TestsContext) {
            const extension: jc.Extension = {
                name: "test-extension",
                install: null
            };
            expect(() => this.core.use([extension])).toThrowError();
        });

        it("should throw when extension has already been installed", function (this: TestsContext) {
            const extension: jc.Extension = {
                name: "test",
                install: () => undefined
            };
            this.core.use([extension]);

            expect(() => this.core.use([extension])).toThrowError();
        });

        it("should pass itself to extension's install", function (this: TestsContext) {
            const extension: jc.Extension = {
                name: "test",
                install: () => undefined
            };
            const install = spyOn(extension, "install");

            this.core.use([extension]);
            this.core.init();

            const args = install.calls.argsFor(0);
            expect(args.length).toEqual(1);
            expect(args[0]).toBe(this.core);
        });
    });
});