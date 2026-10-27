import { guard, isThenable } from "../utils";

interface Plugin extends jc.Func {
    (next: () => any, ...args: any[]): any;
}

export class HooksSystem {

    private _plugins: Record<string, Plugin[]> = Object.create(null);

    public createHook<T extends jc.Func>(type: jc.HookType, method: T, context?: any): T {
        guard
            .nonEmptyString(type, "m16")
            .function(method, "m17", type);

        const hooksContext = this;
        return function(...args: any[]): any {
            const plugins = hooksContext._plugins[type];
            if (!plugins) {
                return method.apply(context, args);
            }

            return plugins.reduceRight(
                (pipeline, plugin) => () => {
                    let nextResult: unknown;
                    const next = () => (nextResult = pipeline());
                    const result = plugin.apply(context, [next, ...args]);
                    // Plugins written for synchronous lifecycles call next() without returning it;
                    // pass the promise through so asynchronous init, destroy, start and stop are still awaited.
                    return result === undefined && isThenable(nextResult) ? nextResult : result;
                },
                () => method.apply(context, args)
            )();
        } as T;
    }

    public addPlugin(hookType: jc.HookType, plugin: Plugin): void {
        guard
            .nonEmptyString(hookType, "m18")
            .function(plugin, "m19", hookType);

        (this._plugins[hookType] || (this._plugins[hookType] = [])).push(plugin);
    }
}