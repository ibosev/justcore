import { atom, type ReadableAtom } from "nanostores";

export interface InspectorEvent {
    id: number;
    time: string;
    kind: "message" | "lifecycle" | "error";
    label: string;
    detail?: string;
}

export interface Download {
    /** Bytes that came over the network; 0 for a cache hit. */
    transferred: number;
    /** The compressed size of the file. */
    size: number;
}

export interface InspectorService {
    readonly $events: ReadableAtom<readonly InspectorEvent[]>;
    readonly $running: ReadableAtom<Readonly<Record<string, readonly string[]>>>;
    /** Every file the page fetched, by URL. */
    readonly $downloads: ReadableAtom<Readonly<Record<string, Download>>>;
}

const MAX_EVENTS = 40;

/**
 * A justcore extension: it plugs into core hooks to record bus traffic and module lifecycle,
 * including how long each remote took to download and start, and exposes the record as stores.
 */
export function createInspector(): {
    extension: jc.Extension;
    service: InspectorService;
    record(kind: InspectorEvent["kind"], label: string, detail?: unknown): void;
} {
    const $events = atom<readonly InspectorEvent[]>([]);
    const $running = atom<Readonly<Record<string, readonly string[]>>>({});
    const $downloads = atom<Readonly<Record<string, Download>>>({});
    let nextId = 1;

    // Resource timing tells a cache hit from a network load. Cross-origin files need the CDN's Timing-Allow-Origin header.
    new PerformanceObserver(list => {
        const next = { ...$downloads.get() };
        for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
            next[entry.name] = { transferred: entry.transferSize, size: entry.encodedBodySize };
        }
        $downloads.set(next);
    }).observe({ type: "resource", buffered: true });

    const record = (kind: InspectorEvent["kind"], label: string, detail?: unknown) => {
        $events.set([{
            id: nextId++,
            time: new Date().toLocaleTimeString(),
            kind,
            label,
            detail: detail === undefined ? undefined : JSON.stringify(detail)
        }, ...$events.get()].slice(0, MAX_EVENTS));
    };

    const extension: jc.Extension = {
        name: "showcase-inspector",
        install: core => {
            const syncRunning = () => $running.set({ ...core.runningModules });
            return {
                onMessagePublish(next, message) {
                    const { type, ...payload } = message;
                    record("message", type, payload);
                    return next();
                },
                onModuleStart(next, id) {
                    const started = performance.now();
                    // Settles once init has finished or failed: for a remote, that includes downloading its bundle.
                    return next().then(() => {
                        syncRunning();
                        record("lifecycle", `started ${id} in ${Math.round(performance.now() - started)} ms`);
                    }, (err: unknown) => {
                        syncRunning();
                        record("error", `failed to start ${id}`, `${err instanceof Error ? err.message : String(err)}; start it again to retry`);
                        throw err;
                    });
                },
                onModuleStop(next, id) {
                    return next().then(() => {
                        syncRunning();
                        record("lifecycle", `stopped ${id}`);
                    });
                }
            };
        }
    };

    return { extension, service: { $events, $running, $downloads }, record };
}
