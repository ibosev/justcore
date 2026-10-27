export declare class Core implements jc.Core {
    Sandbox: jc.SandboxClass;
    readonly serviceLocator: jc.ServiceLocator;
    private _isInitialized;
    private _onInit;
    private readonly _hooksSystem;
    private readonly _messageBus;
    private readonly _extensions;
    private readonly _modules;
    constructor();
    get version(): string;
    get extensions(): string[];
    get modules(): string[];
    get runningModules(): {
        [id: string]: string[];
    };
    use(extensions: jc.Extension[]): void;
    createHook<T extends jc.Func>(type: jc.HookType, method: T, context?: any): T;
    init(onInit?: jc.Func<void>): void;
    addModule(id: string, factory: jc.ModuleFactory): void;
    startModule(id: string, options?: jc.ModuleStartOptions): Promise<void>;
    stopModule(id: string, instanceId?: string): Promise<void>;
    onMessage(type: string, handler: jc.MessageHandler): jc.Unsubscribe;
    publishAsync<T extends jc.Message>(message: T): void;
    private _installExtensions;
    private _install;
    private _onDomReady;
    private _subscribe;
    private _stop;
    private _destroy;
}
