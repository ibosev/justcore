export declare class Sandbox implements jc.Sandbox {
    private _core;
    private _moduleId;
    private _instanceId;
    private _signal;
    constructor(core: jc.Core, moduleId: string, instanceId: string, signal?: AbortSignal);
    get moduleId(): string;
    get instanceId(): string;
    get signal(): AbortSignal;
    startModule(id: string, options?: jc.ModuleStartOptions): Promise<void>;
    stopModule(id: string, instanceId?: string): Promise<void>;
    publishAsync<T extends jc.Message>(message: T): void;
    getService<K extends keyof jc.ServiceLocatorMap>(key: K): jc.ServiceLocatorMap[K];
    getService<S>(key: string): S;
}
