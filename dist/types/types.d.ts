declare global {
    namespace jc {
        /** A simplified typing of generic function. */
        interface Func<T = any> {
            (...args: any[]): T;
        }
        /** A helper interface that holds all supported lifecycle hooks. */
        interface PluginsMap {
            /** Invoked when {@link Core.init} */
            onCoreInit(this: Core, next: Func<void>): void;
            /** Invoked when {@link Core.onMessage} */
            onMessageSubscribe(this: Core, next: Func<Unsubscribe>, messageType: string, handler: MessageHandler): Unsubscribe;
            /** Invoked when {@link Core.publishAsync} */
            onMessagePublish<T extends Message>(this: Core, next: Func<void>, message: T): void;
            /** Invoked when {@link Core.addModule} */
            onModuleAdd(this: Core, next: Func<void>, id: string, factory: ModuleFactory): void;
            /** Invoked when {@link Core.startModule} */
            onModuleStart(this: Core, next: Func<Promise<void>>, id: string, options?: ModuleStartOptions): void | Promise<void>;
            /** Invoked when {@link Core.stopModule} */
            onModuleStop(this: Core, next: Func<Promise<void>>, id: string, instanceId?: string): void | Promise<void>;
            /** Invoked when {@link Module.init} */
            onModuleInit<TProps = {}>(this: Module, next: Func<void | Promise<void>>, props?: TProps): void | Promise<void>;
            /** Invoked when {@link Module.moduleWillSubscribe} */
            onModuleSubscribe(this: Module, next: Func<string[]>): string[];
            /** Invoked when {@link Module.moduleDidReceiveMessage} */
            onModuleReceiveMessage<T extends Message>(this: Module, next: Func<void>, message: T): void;
            /** Invoked when {@link Module.moduleDidReceiveProps} */
            onModuleReceiveProps<TProps = {}>(this: Module, next: Func<void>, nextProps: TProps): void;
            /** Invoked when {@link Module.destroy} */
            onModuleDestroy(this: Module, next: Func<void | Promise<void>>): void | Promise<void>;
        }
        /** One of the the supported hooks' keys. See {@link PluginsMap} */
        type HookType = keyof PluginsMap;
        /** A piece of code that extends the core. */
        interface Extension {
            /**
             * An unique name of the extension that will distinguish your extension from the rest.
             * It will be used for logging too.
             */
            name: string;
            /**
             * A callback that will be invoked on core init.
             * Here you can extend the core, the prototype of this core's own Sandbox class or
             * you can plug into some of the lifecycle hooks by returning an object that has
             * hook types as keys and plugins as values.
             */
            install: (core: Core) => Partial<PluginsMap> | void;
        }
        /**
         * A mediator object that hooks everything together and runs your application.
         */
        interface Core {
            /** Returns current justcore's version. */
            version: Readonly<string>;
            /** Lists all installed extensions. */
            extensions: Readonly<string[]>;
            /** Lists all added module ids. */
            modules: Readonly<string[]>;
            /** Lists all running module instances by their id. */
            runningModules: Readonly<{
                [id: string]: string[];
            }>;
            /** Core's dependency container. */
            serviceLocator: ServiceLocator;
            /** The Sandbox class that this core uses to create sandbox instances. Each core has its own subclass. */
            Sandbox: SandboxClass;
            /** Schedules a list of extensions for installation. */
            use(extensions: Extension[]): void;
            /** Creates a hook from given method, e.g. for an extension that exposes its own hook. */
            createHook<T extends Func>(type: HookType, method: T, context?: any): T;
            /** Initializes the core. */
            init(onInit?: Func<void>): void;
            /** Adds a module. */
            addModule(id: string, factory: ModuleFactory): void;
            /**
             * Starts an instance of given module and initializes it.
             * Rejects with the error when the factory, init or subscribing fails, after the instance is cleaned up.
             * The instance is listed in {@link runningModules} only after init (including asynchronous init) completes.
             */
            startModule(id: string, options?: ModuleStartOptions): Promise<void>;
            /**
             * Stops a given module instance: untracks it, aborts its sandbox signal, then calls destroy.
             * Resolves when destroy finishes; a failed destroy is logged, not rejected.
             * Stopping an instance whose init is still pending waits for init first.
             */
            stopModule(id: string, instanceId?: string): Promise<void>;
            /** Subscribes for messages of given type. */
            onMessage(type: string, handler: MessageHandler): Unsubscribe;
            /**
             * Publishes a message asynchronously
             * by scheduling (setTimeout) each message handler to the event loop.
             * That async behavior gives us the following benefits:
             *
             * - Each message handler is invoked in dedicated call stack;
             *
             * - Loose coupling between publishers and handlers.
             *   If you somehow rely on the publishAsync's result, your modules don't work independently from each other.
             *
             * - Process of tracing messages won't suffer when message handlers depth increases.
             *   Because of the event loop's nature in javascript,
             *	 each message will be published to all of its handlers first even though some of the handlers might publish a new message along the way,
             *	 e.g. lets say:
             *	 - Module "A" publishes message "M1"
             *	 - Module "B" subscribes for message "M1" and publishes a new message "M2" when message "M1" comes
             *	 - Module "C" subscribes for message "M1"
             *	 - Module "D" subscribes for message "M2"
             *
             *	 When Module "A" publishes its message "M1", the order of the handlers invoked will be:
             *
             *	 Module "B" -> Module "C" -> Module "D".
             */
            publishAsync<T extends Message>(message: T): void;
        }
        /** The sandbox's function constructor. */
        interface SandboxClass {
            new (core: Core, moduleId: string, instanceId: string, signal?: AbortSignal): Sandbox;
        }
        /**
         *  Connects the modules to the outside world. A facade of the core.
         */
        interface Sandbox {
            /** Id of the module that it serves for. */
            moduleId: Readonly<string>;
            /** Instance id of the module that it serves for. */
            instanceId: Readonly<string>;
            /**
             * Aborted when the module instance stops or fails to start.
             * Pass it to addEventListener, fetch etc., or listen for "abort" to release other resources.
             */
            signal: Readonly<AbortSignal>;
            /** See {@link Core.startModule} */
            startModule(id: string, options?: ModuleStartOptions): Promise<void>;
            /** See {@link Core.stopModule} */
            stopModule(id: string, instanceId?: string): Promise<void>;
            /** See {@link Core.publishAsync} */
            publishAsync<T extends Message>(message: T): void;
            /** See {@link ServiceLocator.getService} */
            getService<K extends keyof ServiceLocatorMap>(key: K): ServiceLocatorMap[K];
            getService<S>(key: string): S;
        }
        /**
         * A function that accepts a sandbox instance and creates a module for it.
         * It may return a promise, e.g. when the module's code is downloaded first; see remoteModule.
         */
        interface ModuleFactory {
            (sandbox: Sandbox): Module | Promise<Module>;
        }
        /**
         * An object that represents a part of your domain.
         * It contains business logic related to its particular job.
         */
        interface Module<TProps = {}> {
            /** The sandbox instance that serves the module. */
            sandbox: Sandbox;
            /** A lifecycle hook that is called when something starts the module. May return a promise. */
            init(props?: TProps): void | Promise<void>;
            /** A lifecycle hook that determines what messages the module should subscribe for. */
            moduleWillSubscribe?(): string[];
            /**
             * A lifecycle hook that is called when the module receives a message.
             * Implementations may narrow the parameter to the message types they subscribe to.
             */
            moduleDidReceiveMessage?(message: Message): void;
            /** A lifecycle hook that is called when the module has already been started and something tries to start it again. */
            moduleDidReceiveProps?(nextProps?: TProps): void;
            /** A lifecycle hook that is called when something stops the module. May return a promise. */
            destroy(): void | Promise<void>;
        }
        /** Options that can be passed to the core when it starts a module. */
        interface ModuleStartOptions<TProps = {}> {
            /**
             * An id that will distinguish module instances.
             * If not provided, the module id will be used by default.
             */
            instanceId?: string;
            /** Properties that will be passed to the module's init method. */
            props?: TProps;
        }
        /** A function that subscribes for given message. */
        interface MessageHandler<T extends Message = Message> {
            (message: T): void;
        }
        /** An object with data that modules can publish. */
        interface Message {
            /** The type of the message. */
            type: string;
        }
        /**
         * A function that is returned when you subscribe for given message by invoking {@link Core.onMessage}, e.g. in an extension.
         * Caling the function will unsubscribe you.
         */
        interface Unsubscribe {
            (): void;
        }
        /**
         * A dependency injection container.
         */
        interface ServiceLocator {
            addService<K extends keyof ServiceLocatorMap>(key: K, factory: () => ServiceLocatorMap[K]): void;
            addService<S>(key: string, factory: () => S): void;
            getService<K extends keyof ServiceLocatorMap>(key: K): ServiceLocatorMap[K];
            getService<S>(key: string): S;
        }
        /**
         * A helper interface for the service locator.
         * Its key-value pairs will be used by typescript to power your services with typing.
         */
        interface ServiceLocatorMap {
        }
    }
}
export {};
