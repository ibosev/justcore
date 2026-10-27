import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocation, type HistoryHost } from "./location.ts";

function fakeHost(url: string) {
    const listeners: (() => void)[] = [];
    const entries: string[] = [];
    const host: HistoryHost & { back(url: string): void; entries: string[] } = {
        location: { pathname: "", search: "" },
        history: {
            pushState: (_data, _unused, next) => { entries.push(next); go(next); },
            replaceState: (_data, _unused, next) => { entries[entries.length - 1] = next; go(next); }
        },
        addEventListener: (_type, listener) => listeners.push(listener),
        back: previous => { go(previous); listeners.forEach(listener => listener()); },
        entries
    };
    const go = (next: string) => {
        const parsed = new URL(next, "http://shop.test");
        host.location.pathname = parsed.pathname;
        host.location.search = parsed.search;
    };
    go(url);
    entries.push(url);
    return host;
}

test("reads the initial path and query", () => {
    const location = createLocation(fakeHost("/wearables?product=halo-ring"));

    assert.equal(location.$path.get(), "/wearables");
    assert.deepEqual(location.$query.get(), { product: "halo-ring" });
});

test("setQuery merges, removes undefined keys and pushes history", () => {
    const host = fakeHost("/audio?product=studio-buds&q=bud");
    const location = createLocation(host);

    location.setQuery({ q: undefined, product: "pebble-speaker" });

    assert.deepEqual(location.$query.get(), { product: "pebble-speaker" });
    assert.deepEqual(host.entries, ["/audio?product=studio-buds&q=bud", "/audio?product=pebble-speaker"]);
});

test("replace does not add a history entry", () => {
    const host = fakeHost("/");
    const location = createLocation(host);

    location.setQuery({ q: "lamp" }, { replace: true });

    assert.deepEqual(host.entries, ["/?q=lamp"]);
});

test("back and forward update the stores, which notify only on change", () => {
    const host = fakeHost("/");
    const location = createLocation(host);
    const paths: string[] = [];
    location.$path.listen(path => paths.push(path));

    location.navigate("/home", { query: { product: "glow-lamp" } });
    location.setQuery({ product: "nimbus-hub" });
    host.back("/");

    assert.deepEqual(paths, ["/home", "/"]);
    assert.deepEqual(location.$query.get(), {});
});
