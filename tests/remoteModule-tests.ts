import { Core } from "../src/components/Core";
import { remoteModule } from "../src/remoteModule";

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe("remoteModule", () => {

    let core: jc.Core;
    let calls: string[];

    const remoteFactory: jc.ModuleFactory = sandbox => ({
        sandbox,
        init: props => { calls.push(`init:${JSON.stringify(props)}:${sandbox.moduleId}`); },
        destroy: () => { calls.push("destroy"); },
        moduleWillSubscribe: () => ["event"],
        moduleDidReceiveMessage: message => { calls.push(`message:${message.type}`); }
    });

    beforeEach(() => {
        spyOn(console, "error");
        core = new Core();
        core.init();
        calls = [];
    });

    it("should throw when load is not a function", () => {
        expect(() => remoteModule(null as any)).toThrowError();
    });

    it("should load on first start and run the remote module's init with the props", async () => {
        const load = jasmine.createSpy("load").and.resolveTo({ default: remoteFactory });
        core.addModule("remote", remoteModule(load));
        expect(load).not.toHaveBeenCalled();

        const starting = core.startModule("remote", { props: { root: "r" } });
        expect(core.runningModules.remote).toEqual([]);
        await starting;

        expect(load).toHaveBeenCalledTimes(1);
        expect(calls).toEqual([`init:{"root":"r"}:remote`]);
        expect(core.runningModules.remote).toEqual(["remote"]);
    });

    it("should accept a loader that resolves to a factory", async () => {
        core.addModule("remote", remoteModule(() => Promise.resolve(remoteFactory)));

        await core.startModule("remote");

        expect(core.runningModules.remote).toEqual(["remote"]);
    });

    it("should subscribe the loaded module and stop delivering after stop", async () => {
        core.addModule("remote", remoteModule(() => Promise.resolve(remoteFactory)));
        await core.startModule("remote");

        core.publishAsync({ type: "event" });
        await tick();
        await core.stopModule("remote");
        core.publishAsync({ type: "event" });
        await tick();

        expect(calls.slice(1)).toEqual(["message:event", "destroy"]);
    });

    it("should fail the start when loading fails and retry on the next start", async () => {
        const load = jasmine.createSpy("load").and.returnValues(
            Promise.reject(new Error("network down")),
            Promise.resolve({ default: remoteFactory }));
        core.addModule("remote", remoteModule(load));

        await expectAsync(core.startModule("remote")).toBeRejectedWithError("network down");
        expect(core.runningModules.remote).toEqual([]);

        await core.startModule("remote");
        expect(load).toHaveBeenCalledTimes(2);
        expect(core.runningModules.remote).toEqual(["remote"]);
    });

    it("should fail the start when the loaded code has no module factory", async () => {
        core.addModule("remote", remoteModule(() => Promise.resolve({ default: "nope" } as any)));

        await expectAsync(core.startModule("remote")).toBeRejected();

        expect(core.runningModules.remote).toEqual([]);
    });

    it("should hand the loaded module itself to hooks and extensions", async () => {
        const hooked = new Core();
        const seen: unknown[] = [];
        hooked.use([{ name: "spy", install: () => ({ onModuleInit(this: jc.Module, next: jc.Func) { seen.push(this); return next(); } }) }]);
        hooked.init();
        let loaded: jc.Module | undefined;
        hooked.addModule("remote", remoteModule(() => Promise.resolve((sandbox: jc.Sandbox) => loaded = {
            sandbox,
            init: () => undefined,
            destroy: () => undefined,
            moduleDidReceiveProps: props => { calls.push(`props:${JSON.stringify(props)}`); }
        })));

        await hooked.startModule("remote");
        await hooked.startModule("remote", { props: { page: 2 } });

        expect(seen).toEqual([loaded]);
        expect(calls).toEqual([`props:{"page":2}`]);
    });

    it("should load once for every instance and restart", async () => {
        const load = jasmine.createSpy("load").and.resolveTo({ default: remoteFactory });
        core.addModule("remote", remoteModule(load));

        await core.startModule("remote");
        await core.startModule("remote", { instanceId: "second" });
        await core.stopModule("remote");
        await core.startModule("remote");

        expect(load).toHaveBeenCalledTimes(1);
        expect(core.runningModules.remote).toEqual(["second", "remote"]);
    });

    it("should destroy the remote module when stopped while loading", async () => {
        let finishLoad!: (value: { default: jc.ModuleFactory }) => void;
        core.addModule("remote", remoteModule(() => new Promise(resolve => { finishLoad = resolve; })));
        core.startModule("remote");

        const stopping = core.stopModule("remote");
        finishLoad({ default: remoteFactory });
        await stopping;

        expect(calls).toEqual([`init:undefined:remote`, "destroy"]);
        expect(core.runningModules.remote).toEqual([]);
    });
});
