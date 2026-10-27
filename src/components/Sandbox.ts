export class Sandbox implements jc.Sandbox {

    private _core: jc.Core;
    private _moduleId: string;
    private _instanceId: string;
    private _signal: AbortSignal;

    constructor(core: jc.Core, moduleId: string, instanceId: string, signal: AbortSignal = new AbortController().signal) {
        this._core = core;
        this._moduleId = moduleId;
        this._instanceId = instanceId;
        this._signal = signal;
    }

    get moduleId(): string {
        return this._moduleId;
    }

    get instanceId(): string {
        return this._instanceId;
    }

    get signal(): AbortSignal {
        return this._signal;
    }

    public startModule(id: string, options?: jc.ModuleStartOptions): Promise<void> {
        return this._core.startModule(id, options);
    }

    public stopModule(id: string, instanceId?: string): Promise<void> {
        return this._core.stopModule(id, instanceId);
    }

    public publishAsync<T extends jc.Message>(message: T): void {
        this._core.publishAsync(message);
    }

    public getService<K extends keyof jc.ServiceLocatorMap>(key: K): jc.ServiceLocatorMap[K];
    public getService<S>(key: string): S;
    public getService(key: string): any {
        return this._core.serviceLocator.getService(key);
    }
}
