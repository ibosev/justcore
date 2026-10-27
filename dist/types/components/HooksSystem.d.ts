interface Plugin extends jc.Func {
    (next: () => any, ...args: any[]): any;
}
export declare class HooksSystem {
    private _plugins;
    createHook<T extends jc.Func>(type: jc.HookType, method: T, context?: any): T;
    addPlugin(hookType: jc.HookType, plugin: Plugin): void;
}
export {};
