import type { LocationService, QueryPatch } from "@showcase/contracts";
import { atom } from "nanostores";

/** The parts of window the location service needs, so it can be tested without a browser. */
export interface HistoryHost {
    location: { pathname: string; search: string };
    history: { pushState(data: unknown, unused: string, url: string): void; replaceState(data: unknown, unused: string, url: string): void };
    addEventListener(type: "popstate", listener: () => void): void;
}

const sameQuery = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>) =>
    Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => a[key] === b[key]);

/** URL-derived shared state. The shell is the only writer of history; modules call the actions. */
export function createLocation(host: HistoryHost = window): LocationService {
    const read = () => ({
        path: host.location.pathname,
        query: Object.fromEntries(new URLSearchParams(host.location.search)) as Record<string, string>
    });
    const initial = read();
    const $path = atom(initial.path);
    const $query = atom<Readonly<Record<string, string>>>(initial.query);

    // Called after our own writes and on back/forward; stores only change when values do.
    const sync = () => {
        const current = read();
        if (current.path !== $path.get()) {
            $path.set(current.path);
        }
        if (!sameQuery(current.query, $query.get())) {
            $query.set(current.query);
        }
    };
    host.addEventListener("popstate", sync);

    const write = (path: string, query: QueryPatch, replace = false) => {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined) {
                params.set(key, value);
            }
        }
        const search = params.toString();
        host.history[replace ? "replaceState" : "pushState"](null, "", search ? `${path}?${search}` : path);
        sync();
    };

    return {
        $path,
        $query,
        navigate: (path, options = {}) => write(path, options.query ?? {}, options.replace),
        setQuery: (patch, options = {}) => write($path.get(), { ...$query.get(), ...patch }, options.replace)
    };
}
