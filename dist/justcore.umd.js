/**
 *  @license justcore
 *  Copyright © Valentin Lozev 2016 - Present
 *  Licensed under the MIT license: http://www.opensource.org/licenses/mit-license.php
 *  Source code: http://github.com/valentin-lozev/justcore
 */
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.justcore = {}));
})(this, (function (exports) { 'use strict';

    var VERSION = "3.0.0";

    const errorCodes = {
        m1: () => "use(): extensions must be installed before init",
        m2: () => "use(): extensions must be passed as an array",
        m3: () => "use(): extension must be an object",
        m4: () => "use(): extension name must be a non empty string",
        m5: (id) => `use(): "${id}" install must be a function`,
        m6: (id) => `use(): "${id}" has already been used`,
        m7: () => "init(): core has already been initialized",
        m8: () => "addModule(): id must be a non empty string",
        m9: (id) => `addModule(): "${id}" has already been added`,
        m10: (id) => `addModule(): "${id}" factory must be a function`,
        m11: () => "startModule(): core must be initialized first",
        m12: (id) => `startModule(): "${id}" not found`,
        m13: (id) => `startModule(): "${id}"'s sandbox property must be the sandbox passed to its factory`,
        m14: (id) => `startModule(): "${id}" init hook must be defined`,
        m15: (id) => `startModule(): "${id}" destroy hook must be defined`,
        m16: () => "createHook(): type must be a non empty string",
        m17: (id) => `createHook(): "${id}" method must be a function`,
        m18: () => "addPlugin(): hook type must be a non empty string",
        m19: (id) => `addPlugin(): "${id}" plugin must be a function`,
        m20: () => "onMessage(): message type must be a non empty string",
        m21: (id) => `onMessage(): "${id}" handler should be a function`,
        m22: () => "publishAsync(): message must be an object",
        m23: (id) => `"${id}" moduleDidReceiveMessage hook must be defined in order to subscribe`,
        m24: () => "addService(): key must be a non empty string",
        m25: (key) => `addService(): "${key}" has already been added`,
        m26: (key) => `addService(): "${key}" factory must be a function that returns service instance`,
        m27: (key) => `getService(): ${key} service not found`,
        m28: () => "remoteModule(): load must be a function",
        m29: () => "remoteModule(): loaded code must export a module factory as its default export",
        m30: (id) => `startModule(): "${id}" factory must return a module object`,
    };
    function throwError(code, formatId) {
        const msgCreator = errorCodes[code];
        throw new Error(msgCreator(formatId));
    }
    class ArgumentGuard {
        array(arg, code, formatId) {
            if (!Array.isArray(arg)) {
                throwError(code, formatId);
            }
            return this;
        }
        object(arg, code, formatId) {
            if (typeof arg !== "object" || arg === null) {
                throwError(code, formatId);
            }
            return this;
        }
        function(arg, code, formatId) {
            if (typeof arg !== "function") {
                throwError(code, formatId);
            }
            return this;
        }
        nonEmptyString(arg, code, formatId) {
            if (typeof arg !== "string" || !arg.length) {
                throwError(code, formatId);
            }
            return this;
        }
        true(arg, code, formatId) {
            if (!arg) {
                throwError(code, formatId);
            }
            return this;
        }
        false(arg, code, formatId) {
            if (arg) {
                throwError(code, formatId);
            }
            return this;
        }
    }
    const guard = new ArgumentGuard();
    function isDocumentReady() {
        const state = document.readyState;
        return state === "complete" ||
            state === "interactive" ||
            state === "loaded"; /* old safari browsers */
    }
    const hasOwnProperty = Object.prototype.hasOwnProperty;
    let lastUID = 0;
    function uid() {
        return ++lastUID;
    }
    function noop() { }
    /** Runs next after value settles: synchronously for plain values, chained for promises and thenables. */
    function then(value, next) {
        return isThenable(value) ? Promise.resolve(value).then(next) : next(value);
    }
    function isThenable(value) {
        return !!value && typeof value.then === "function";
    }

    class HooksSystem {
        constructor() {
            this._plugins = Object.create(null);
        }
        createHook(type, method, context) {
            guard
                .nonEmptyString(type, "m16")
                .function(method, "m17", type);
            const hooksContext = this;
            return function (...args) {
                const plugins = hooksContext._plugins[type];
                if (!plugins) {
                    return method.apply(context, args);
                }
                return plugins.reduceRight((pipeline, plugin) => () => {
                    let nextResult;
                    const next = () => (nextResult = pipeline());
                    const result = plugin.apply(context, [next, ...args]);
                    // Plugins written for synchronous lifecycles call next() without returning it;
                    // pass the promise through so asynchronous init, destroy, start and stop are still awaited.
                    return result === undefined && isThenable(nextResult) ? nextResult : result;
                }, () => method.apply(context, args))();
            };
        }
        addPlugin(hookType, plugin) {
            guard
                .nonEmptyString(hookType, "m18")
                .function(plugin, "m19", hookType);
            (this._plugins[hookType] || (this._plugins[hookType] = [])).push(plugin);
        }
    }

    class MessageBus {
        constructor() {
            this._subscribers = Object.create(null);
        }
        onMessage(type, handler) {
            guard
                .nonEmptyString(type, "m20")
                .function(handler, "m21", type);
            return this._addSubscriber(type, handler);
        }
        publishAsync(message) {
            guard.true(typeof message === "object", "m22");
            if (!(message.type in this._subscribers)) {
                return;
            }
            const subscriptions = this._subscribers[message.type];
            Object.keys(subscriptions).forEach(id => {
                this._publishSingle(message, subscriptions, id);
            });
        }
        _publishSingle(message, subscriptions, id) {
            setTimeout(() => {
                // Look the handler up at delivery time: it may have unsubscribed after publish.
                const handler = subscriptions[id];
                if (!handler) {
                    return;
                }
                try {
                    handler(message);
                }
                catch (err) {
                    console.error(`publishAsync(): Receive "${message.type}" message failed.`);
                    console.error(err);
                }
            }, 0);
        }
        _addSubscriber(type, handler) {
            if (!(type in this._subscribers)) {
                this._subscribers[type] = Object.create(null);
            }
            const subscriptionId = uid();
            this._subscribers[type][subscriptionId] = handler;
            return () => {
                delete this._subscribers[type][subscriptionId];
            };
        }
    }

    class Sandbox {
        constructor(core, moduleId, instanceId, signal = new AbortController().signal) {
            this._core = core;
            this._moduleId = moduleId;
            this._instanceId = instanceId;
            this._signal = signal;
        }
        get moduleId() {
            return this._moduleId;
        }
        get instanceId() {
            return this._instanceId;
        }
        get signal() {
            return this._signal;
        }
        startModule(id, options) {
            return this._core.startModule(id, options);
        }
        stopModule(id, instanceId) {
            return this._core.stopModule(id, instanceId);
        }
        publishAsync(message) {
            this._core.publishAsync(message);
        }
        getService(key) {
            return this._core.serviceLocator.getService(key);
        }
    }

    class ServiceLocator {
        constructor() {
            this.container = Object.create(null);
            this.instantiationsStack = [];
        }
        addService(key, factory) {
            guard.nonEmptyString(key, "m24")
                .false(hasOwnProperty.call(this.container, key), "m25", key)
                .function(factory, "m26", key);
            this.container[key] = {
                factory: factory,
                instance: null,
                created: false
            };
        }
        getService(key) {
            const serviceData = this.container[key];
            guard.true(!!serviceData, "m27", key);
            if (serviceData.created) {
                return serviceData.instance;
            }
            if (this.isServiceBeingInstantiated(key)) {
                throw new Error(`getService(): service circular dependency ${this.instantiationsStack.join(" -> ")} -> ${key}`);
            }
            this.instantiationsStack.push(key);
            try {
                serviceData.instance = serviceData.factory();
                serviceData.created = true;
            }
            finally {
                this.instantiationsStack.pop();
            }
            return serviceData.instance;
        }
        isServiceBeingInstantiated(key) {
            return this.instantiationsStack.indexOf(key) > -1;
        }
    }

    class Core {
        constructor() {
            // A subclass per core, so an extension that augments its prototype does not reach other cores.
            this.Sandbox = class extends Sandbox {
            };
            this.serviceLocator = new ServiceLocator();
            this._isInitialized = false;
            this._onInit = () => { };
            this._hooksSystem = new HooksSystem();
            this._messageBus = new MessageBus();
            this._extensions = Object.create(null);
            this._modules = Object.create(null);
            this._onDomReady = this._onDomReady.bind(this);
            // Hooked from the start, so a call behaves the same before and after init.
            this.addModule = this.createHook("onModuleAdd", this.addModule, this);
            this.startModule = this.createHook("onModuleStart", this.startModule, this);
            this.stopModule = this.createHook("onModuleStop", this.stopModule, this);
            this.onMessage = this.createHook("onMessageSubscribe", this.onMessage, this);
            this.publishAsync = this.createHook("onMessagePublish", this.publishAsync, this);
        }
        get version() {
            return VERSION;
        }
        get extensions() {
            return Object.keys(this._extensions);
        }
        get modules() {
            return Object.keys(this._modules);
        }
        get runningModules() {
            return this.modules
                .reduce((result, id) => {
                const instances = this._modules[id].instances;
                result[id] = Object.keys(instances).filter(instanceId => instances[instanceId].running);
                return result;
            }, Object.create(null));
        }
        use(extensions) {
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
        createHook(type, method, context) {
            return this._hooksSystem.createHook(type, method, context);
        }
        init(onInit) {
            guard.false(this._isInitialized, "m7");
            this._onInit = this.createHook("onCoreInit", onInit || function () { }, this);
            this._installExtensions();
            if (isDocumentReady()) {
                setTimeout(this._onDomReady, 0);
            }
            else {
                document.addEventListener("DOMContentLoaded", this._onDomReady);
            }
            this._isInitialized = true;
        }
        addModule(id, factory) {
            guard
                .nonEmptyString(id, "m8")
                .false(id in this._modules, "m9")
                .function(factory, "m10", id);
            this._modules[id] = {
                factory: factory,
                instances: Object.create(null)
            };
        }
        startModule(id, options = {}) {
            guard.true(this._isInitialized, "m11")
                .true(id in this._modules, "m12", id);
            const moduleData = this._modules[id];
            const instanceId = options.instanceId || id;
            const existing = moduleData.instances[instanceId];
            if (existing) {
                const running = existing.module;
                if (existing.running && running && typeof running.moduleDidReceiveProps === "function") {
                    this.createHook("onModuleReceiveProps", running.moduleDidReceiveProps, running)(options.props);
                }
                return existing.ready;
            }
            const controller = new AbortController();
            const sandbox = new this.Sandbox(this, id, instanceId, controller.signal);
            let settle;
            // Registered before the factory and init run, so a reentrant start or stop finds this instance instead of creating another.
            const instance = {
                controller,
                running: false,
                ready: new Promise(resolve => { settle = resolve; })
            };
            moduleData.instances[instanceId] = instance;
            let initialized = false;
            const failed = (err) => {
                if (moduleData.instances[instanceId] === instance) {
                    delete moduleData.instances[instanceId];
                }
                controller.abort();
                // Init finished but a later step (e.g. subscribing) failed: let the module undo its own work, then report.
                return Promise.resolve(initialized ? this._destroy(id, instance.module) : undefined)
                    .then(() => Promise.reject(err));
            };
            let result;
            try {
                result = Promise.resolve(then(moduleData.factory(sandbox), (module) => {
                    guard
                        .object(module, "m30", id)
                        .true(module.sandbox === sandbox, "m13", id)
                        .function(module.init, "m14", id)
                        .function(module.destroy, "m15", id);
                    instance.module = module;
                    const init = (props) => then(module.init(props), () => { initialized = true; });
                    return then(this.createHook("onModuleInit", init, module)(options.props), () => {
                        this._subscribe(id, module, controller.signal);
                        instance.running = true;
                    });
                })).then(noop, failed);
            }
            catch (err) {
                result = failed(err);
            }
            settle(result);
            return instance.ready;
        }
        stopModule(id, instanceId) {
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
        onMessage(type, handler) {
            return this._messageBus.onMessage(type, handler);
        }
        publishAsync(message) {
            this._messageBus.publishAsync(message);
        }
        _installExtensions() {
            Object
                .keys(this._extensions)
                .forEach(name => this._install(this._extensions[name]));
        }
        _install(extension) {
            const plugins = extension.install(this) || {};
            Object.keys(plugins)
                .forEach(hookType => this._hooksSystem.addPlugin(hookType, plugins[hookType]));
        }
        _onDomReady() {
            document.removeEventListener("DOMContentLoaded", this._onDomReady);
            this._onInit();
        }
        _subscribe(id, module, signal) {
            const messages = typeof module.moduleWillSubscribe === "function"
                ? this.createHook("onModuleSubscribe", module.moduleWillSubscribe, module)()
                : null;
            if (!Array.isArray(messages) || !messages.length) {
                return;
            }
            guard.function(module.moduleDidReceiveMessage, "m23", id);
            const handler = this.createHook("onModuleReceiveMessage", module.moduleDidReceiveMessage, module);
            // The signal aborts on stop and on failed start, so every subscription made here is released.
            // Each listener is a fresh closure: EventTarget silently drops a listener that is already registered.
            messages.forEach(type => {
                const unsubscribe = this.onMessage(type, handler);
                signal.addEventListener("abort", () => unsubscribe(), { once: true });
            });
        }
        _stop(id, moduleData, instanceId, instance) {
            // Untrack and release resources first, so a failing destroy cannot leave a half-stopped instance.
            delete moduleData.instances[instanceId];
            instance.controller.abort();
            return this._destroy(id, instance.module);
        }
        _destroy(id, module) {
            const failed = (err) => {
                console.error(`stopModule(): "${id}" destroy failed`);
                console.error(err);
            };
            try {
                return Promise.resolve(this.createHook("onModuleDestroy", module.destroy, module)()).then(noop, failed);
            }
            catch (err) {
                failed(err);
                return Promise.resolve();
            }
        }
    }

    /**
     * Creates a module whose code is loaded on its first start, e.g. an independently deployed bundle on a CDN.
     * `load` resolves to a module factory, or to an ES module whose default export is one:
     * `core.addModule("cart", remoteModule(() => import("https://cdn.example.com/cart.3f2a9c.js")))`.
     * A failed load fails that start like a failed init does, and the next start retries it.
     * The load function stays in the caller's code, so its bundler, import map or federation runtime resolves it.
     */
    function remoteModule(load) {
        guard.function(load, "m28");
        let loading;
        return sandbox => (loading || (loading = load()
            .then(source => {
            const create = typeof source === "function" ? source : source && source.default;
            guard.function(create, "m29");
            return create;
        })
            .catch(err => {
            // A failed download is not cached by the browser either, so the next start retries it.
            loading = undefined;
            throw err;
        })))
            .then(create => create(sandbox));
    }

    exports.Core = Core;
    exports.remoteModule = remoteModule;

}));
