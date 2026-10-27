import { Core } from "../src/components/Core";

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function deferred(): { promise: Promise<void>; resolve(): void; reject(err: Error): void; } {
    let resolve!: () => void;
    let reject!: (err: Error) => void;
    const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

describe("Module lifecycle", () => {

    let core: jc.Core;
    let received: number;
    let destroyed: number;

    function addModule(id: string, overrides: Partial<jc.Module> = {}): void {
        core.addModule(id, sandbox => ({
            sandbox,
            init: () => undefined,
            destroy: () => { destroyed++; },
            moduleDidReceiveMessage: () => { received++; },
            ...overrides
        }));
    }

    beforeEach(() => {
        spyOn(console, "error");
        spyOn(console, "warn");
        core = new Core();
        core.init();
        received = 0;
        destroyed = 0;
    });

    describe("subscriptions", () => {
        it("should remove every subscription on stop, including duplicate message types", async () => {
            addModule("m", { moduleWillSubscribe: () => ["event", "event"] });
            core.startModule("m");
            core.stopModule("m");

            core.publishAsync({ type: "event" });
            await tick();

            expect(received).toEqual(0);
        });

        it("should not deliver messages queued before stop", async () => {
            addModule("m", { moduleWillSubscribe: () => ["event"] });
            core.startModule("m");

            core.publishAsync({ type: "event" });
            core.stopModule("m");
            await tick();

            expect(received).toEqual(0);
        });

        it("should start a module that subscribes to an empty list without a message handler", () => {
            addModule("m", { moduleWillSubscribe: () => [], moduleDidReceiveMessage: undefined });

            core.startModule("m");

            expect(core.runningModules.m).toEqual(["m"]);
        });

        it("should reject the start when messages are listed without a message handler", async () => {
            addModule("m", { moduleWillSubscribe: () => ["event"], moduleDidReceiveMessage: undefined });

            await expectAsync(core.startModule("m")).toBeRejected();

            expect(core.runningModules.m).toEqual([]);
            expect(destroyed).toEqual(1);
        });

        it("should let onModuleSubscribe and onModuleReceiveMessage plugins see the module", async () => {
            const hooked = new Core();
            const seen: unknown[] = [];
            hooked.use([{
                name: "subscriptions",
                install: () => ({
                    onModuleSubscribe(this: jc.Module, next: jc.Func<string[]>): string[] { seen.push(this); return [...next(), "extra"]; },
                    onModuleReceiveMessage(this: jc.Module, next: jc.Func<void>, message: jc.Message): void { seen.push(message.type); next(); }
                })
            }]);
            hooked.init();
            let module: jc.Module | undefined;
            hooked.addModule("m", sandbox => module = {
                sandbox,
                init: () => undefined,
                destroy: () => undefined,
                moduleWillSubscribe: () => ["event"],
                moduleDidReceiveMessage: () => { received++; }
            });

            await hooked.startModule("m");
            hooked.publishAsync({ type: "extra" });
            await tick();

            expect(seen).toEqual([module, "extra"]);
            expect(received).toEqual(1);
        });

        it("should roll back earlier subscriptions and destroy the module when a later subscription fails", async () => {
            addModule("m", { moduleWillSubscribe: () => ["event", ""] });

            const starting = expectAsync(core.startModule("m")).toBeRejected();
            core.publishAsync({ type: "event" });
            await tick();

            await starting;
            expect(core.runningModules.m).toEqual([]);
            expect(received).toEqual(0);
            expect(destroyed).toEqual(1);
        });
    });

    describe("stop", () => {
        it("should untrack and clean up an instance whose destroy throws", async () => {
            addModule("m", {
                moduleWillSubscribe: () => ["event"],
                destroy: () => { throw new Error("destroy failed"); }
            });
            core.startModule("m");

            await core.stopModule("m");
            core.publishAsync({ type: "event" });
            await tick();

            expect(core.runningModules.m).toEqual([]);
            expect(received).toEqual(0);
            expect(console.error).toHaveBeenCalled();
        });

        it("should abort the sandbox signal so modules can release their own resources", () => {
            let signal: AbortSignal | undefined;
            core.addModule("m", sandbox => {
                signal = sandbox.signal;
                return { sandbox, init: () => undefined, destroy: () => undefined };
            });
            core.startModule("m");
            expect(signal!.aborted).toBe(false);

            core.stopModule("m");

            expect(signal!.aborted).toBe(true);
        });

        it("should wait for an asynchronous destroy", async () => {
            const destroy = deferred();
            let stopped = false;
            addModule("m", { destroy: () => destroy.promise });
            core.startModule("m");

            const stopping = core.stopModule("m").then(() => { stopped = true; });
            await tick();
            expect(stopped).toBe(false);

            destroy.resolve();
            await stopping;
            expect(stopped).toBe(true);
        });
    });

    describe("asynchronous init", () => {
        it("should mark the instance running only after init resolves", async () => {
            const init = deferred();
            addModule("m", { init: () => init.promise });

            const starting = core.startModule("m");
            expect(core.runningModules.m).toEqual([]);

            init.resolve();
            await starting;
            expect(core.runningModules.m).toEqual(["m"]);
        });

        it("should subscribe only after init resolves", async () => {
            const init = deferred();
            addModule("m", { init: () => init.promise, moduleWillSubscribe: () => ["event"] });
            const starting = core.startModule("m");

            core.publishAsync({ type: "event" });
            await tick();
            expect(received).toEqual(0);

            init.resolve();
            await starting;
            core.publishAsync({ type: "event" });
            await tick();
            expect(received).toEqual(1);
        });

        it("should clean up without destroying when init rejects", async () => {
            const init = deferred();
            addModule("m", { init: () => init.promise });
            const starting = core.startModule("m");

            init.reject(new Error("init failed"));

            await expectAsync(starting).toBeRejectedWithError("init failed");
            expect(core.runningModules.m).toEqual([]);
            expect(destroyed).toEqual(0);
        });

        it("should defer a stop requested during init until init completes", async () => {
            const init = deferred();
            const order: string[] = [];
            addModule("m", {
                init: () => init.promise.then(() => { order.push("init"); }),
                destroy: () => { order.push("destroy"); }
            });
            core.startModule("m");

            const stopping = core.stopModule("m");
            init.resolve();
            await stopping;

            expect(order).toEqual(["init", "destroy"]);
            expect(core.runningModules.m).toEqual([]);
        });
    });

    it("should not create a second instance when init starts the same instance again", () => {
        let created = 0;
        core.addModule("m", sandbox => {
            created++;
            return { sandbox, init: () => { core.startModule("m"); }, destroy: () => undefined };
        });

        core.startModule("m");

        expect(created).toEqual(1);
        expect(core.runningModules.m).toEqual(["m"]);
    });

    describe("extensions written for synchronous lifecycles", () => {
        it("should still await asynchronous init and destroy", async () => {
            const legacy = new Core();
            const order: string[] = [];
            // Plugins in the 2.x style: call next() and return nothing.
            legacy.use([{
                name: "legacy",
                install: () => ({
                    onModuleStart(next: jc.Func): void { next(); },
                    onModuleStop(next: jc.Func): void { next(); },
                    onModuleInit(next: jc.Func): void { next(); },
                    onModuleDestroy(next: jc.Func): void { next(); }
                })
            }]);
            legacy.init();
            const init = deferred();
            const destroy = deferred();
            legacy.addModule("m", sandbox => ({
                sandbox,
                init: () => init.promise.then(() => { order.push("init"); }),
                destroy: () => destroy.promise.then(() => { order.push("destroy"); })
            }));

            const starting = legacy.startModule("m").then(() => { order.push("started"); });
            expect(legacy.runningModules.m).toEqual([]);
            init.resolve();
            await starting;
            expect(legacy.runningModules.m).toEqual(["m"]);

            const stopping = legacy.stopModule("m").then(() => { order.push("stopped"); });
            destroy.resolve();
            await stopping;

            expect(order).toEqual(["init", "started", "destroy", "stopped"]);
        });
    });
});
