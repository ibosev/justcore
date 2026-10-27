import { guard, isDocumentReady, noop, then } from "../utils";
import { HooksSystem } from "./HooksSystem";
import { MessageBus } from "./MessageBus";
import { Sandbox } from "./Sandbox";
import { ServiceLocator } from "./ServiceLocator";

interface Instance {
    /** Undefined until the factory, which may be asynchronous, returns the module. */
    module?: jc.Module;
    /** Aborted when the instance stops or fails to start; releases everything tied to its sandbox signal. */
    controller: AbortController;
    /** False until init (including asynchronous init) completes. */
    running: boolean;
    /** Settles when the start attempt finishes: resolves on success, rejects with the failure. */
    ready: Promise<void>;
}

interface ModuleData {
    factory: jc.ModuleFactory;
    instances: Record<string, Instance>;
}

declare const VERSION: string;

export class Core implements jc.Core {

    // A subclass per core, so an extension that augments its prototype does not reach other cores.
    public Sandbox: jc.SandboxClass = class extends Sandbox { };
    public readonly serviceLocator: jc.ServiceLocator = new ServiceLocator();
    private _isInitialized: boolean = false;
    private _onInit: jc.Func<void> = () => { /* replaced in init() */ };
    private readonly _hooksSystem = new HooksSystem();
    private readonly _messageBus = new MessageBus();
    private readonly _extensions: { [name: string]: jc.Extension; } = Object.create(null);
    private readonly _modules: { [id: string]: ModuleData; } = Object.create(null);

    constructor() {
        this._onDomReady = this._onDomReady.bind(this);
        // Hooked from the start, so a call behaves the same before and after init.
        this.addModule = this.createHook("onModuleAdd", this.addModule, this);
        this.startModule = this.createHook("onModuleStart", this.startModule, this);
        this.stopModule = this.createHook("onModuleStop", this.stopModule, this);
        this.onMessage = this.createHook("onMessageSubscribe", this.onMessage, this);
        this.publishAsync = this.createHook("onMessagePublish", this.publishAsync, this);
    }

    get version(): string {
        return VERSION;
    }

    get extensions(): string[] {
        return Object.keys(this._extensions);
    }

    get modules(): string[] {
        return Object.keys(this._modules);
    }

    get runningModules(): { [id: string]: string[]; } {
        return this.modules
            .reduce((result, id) => {
                const instances = this._modules[id].instances;
                result[id] = Object.keys(instances).filter(instanceId => instances[instanceId].running);
                return result;
            }, Object.create(null));
    }

    public use(extensions: jc.Extension[]): void {
        guard
            .false(this._isInitialized, "m1")
            .array(extensions, "m2");

        extensions.forEach(x => {
            guard
                .object(x, "m3")
                .nonEmptyString(x.name, "m4")
                .function(x.install, "m5", x.name)
                .false(x.name in this._extensions, "m6", x.name);

            this._extensions[x.name] = x;
        });
    }

    public createHook<T extends jc.Func>(type: jc.HookType, method: T, context?: any): T {
        return this._hooksSystem.createHook(type, method, context);
    }

    public init(onInit?: jc.Func<void>): void {
        guard.false(this._isInitialized, "m7");

        this._onInit = this.createHook("onCoreInit", onInit || function() { /* ignored */ }, this);
        this._installExtensions();

        if (isDocumentReady()) {
            setTimeout(this._onDomReady, 0);
        } else {
            document.addEventListener("DOMContentLoaded", this._onDomReady);
        }

        this._isInitialized = true;
    }

    public addModule(id: string, factory: jc.ModuleFactory): void {
        guard
            .nonEmptyString(id, "m8")
            .false(id in this._modules, "m9")
            .function(factory, "m10", id);

        this._modules[id] = {
            factory: factory,
            instances: Object.create(null)
        };
    }

    public startModule(id: string, options: jc.ModuleStartOptions = {}): Promise<void> {
        guard.true(this._isInitialized, "m11")
            .true(id in this._modules, "m12", id);

        const moduleData = this._modules[id];
        const instanceId = options.instanceId || id;
        const existing = moduleData.instances[instanceId];
        if (existing) {
            const running = existing.module;
            if (existing.running && running && typeof running.moduleDidReceiveProps === "function") {
                this.createHook(
                    "onModuleReceiveProps",
                    running.moduleDidReceiveProps,
                    running)(options.props);
            }
            return existing.ready;
        }

        const controller = new AbortController();
        const sandbox = new this.Sandbox(this, id, instanceId, controller.signal);
        let settle!: (result: Promise<void>) => void;
        // Registered before the factory and init run, so a reentrant start or stop finds this instance instead of creating another.
        const instance: Instance = {
            controller,
            running: false,
            ready: new Promise<void>(resolve => { settle = resolve; })
        };
        moduleData.instances[instanceId] = instance;

        let initialized = false;
        const failed = (err: unknown): Promise<void> => {
            if (moduleData.instances[instanceId] === instance) {
                delete moduleData.instances[instanceId];
            }
            controller.abort();
            // Init finished but a later step (e.g. subscribing) failed: let the module undo its own work, then report.
            return Promise.resolve(initialized ? this._destroy(id, instance.module!) : undefined)
                .then(() => Promise.reject(err));
        };

        let result: Promise<void>;
        try {
            result = Promise.resolve(then(moduleData.factory(sandbox), (module: jc.Module) => {
                guard
                    .object(module, "m30", id)
                    .true(module.sandbox === sandbox, "m13", id)
                    .function(module.init, "m14", id)
                    .function(module.destroy, "m15", id);
                instance.module = module;

                const init = (props?: {}) => then(module.init(props), () => { initialized = true; });
                return then(this.createHook("onModuleInit", init, module)(options.props), () => {
                    this._subscribe(id, module, controller.signal);
                    instance.running = true;
                });
            })).then(noop, failed);
        } catch (err) {
            result = failed(err);
        }
        settle(result);
        return instance.ready;
    }

    public stopModule(id: string, instanceId?: string): Promise<void> {
        const moduleData = this._modules[id];
        if (!moduleData) {
            console.warn(`stopModule(): "${id}" not found`);
            return Promise.resolve();
        }

        const key = instanceId || id;
        const instance = moduleData.instances[key];
        if (!instance) {
            console.warn(`stopModule(): "${id}"'s "${key}" instance is not running`);
            return Promise.resolve();
        }

        if (!instance.running) {
            // Start is still pending: let it finish, then stop the instance if it actually started.
            return instance.ready.then(() => {
                if (moduleData.instances[key] === instance) {
                    return this._stop(id, moduleData, key, instance);
                }
            }, noop);
        }

        return this._stop(id, moduleData, key, instance);
    }

    public onMessage(type: string, handler: jc.MessageHandler): jc.Unsubscribe {
        return this._messageBus.onMessage(type, handler);
    }

    public publishAsync<T extends jc.Message>(message: T): void {
        this._messageBus.publishAsync(message);
    }

    private _installExtensions(): void {
        Object
            .keys(this._extensions)
            .forEach(name => this._install(this._extensions[name]));
    }

    private _install(extension: jc.Extension): void {
        const plugins = extension.install(this) || {};
        (Object.keys(plugins) as jc.HookType[])
            .forEach(hookType => this._hooksSystem.addPlugin(hookType, plugins[hookType] as jc.Func));
    }

    private _onDomReady(): void {
        document.removeEventListener("DOMContentLoaded", this._onDomReady);
        this._onInit();
    }

    private _subscribe(id: string, module: jc.Module, signal: AbortSignal): void {
        const messages = typeof module.moduleWillSubscribe === "function"
            ? this.createHook("onModuleSubscribe", module.moduleWillSubscribe, module)()
            : null;
        if (!Array.isArray(messages) || !messages.length) {
            return;
        }

        guard.function(module.moduleDidReceiveMessage as jc.MessageHandler, "m23", id);
        const handler = this.createHook("onModuleReceiveMessage", module.moduleDidReceiveMessage as jc.MessageHandler, module);
        // The signal aborts on stop and on failed start, so every subscription made here is released.
        // Each listener is a fresh closure: EventTarget silently drops a listener that is already registered.
        messages.forEach(type => {
            const unsubscribe = this.onMessage(type, handler);
            signal.addEventListener("abort", () => unsubscribe(), { once: true });
        });
    }

    private _stop(id: string, moduleData: ModuleData, instanceId: string, instance: Instance): Promise<void> {
        // Untrack and release resources first, so a failing destroy cannot leave a half-stopped instance.
        delete moduleData.instances[instanceId];
        instance.controller.abort();
        return this._destroy(id, instance.module!);
    }

    private _destroy(id: string, module: jc.Module): Promise<void> {
        const failed = (err: unknown) => {
            console.error(`stopModule(): "${id}" destroy failed`);
            console.error(err);
        };
        try {
            return Promise.resolve(this.createHook("onModuleDestroy", module.destroy, module)()).then(noop, failed);
        } catch (err) {
            failed(err);
            return Promise.resolve();
        }
    }
}
