import type { SharedStateService } from "@showcase/contracts";
import { atom, type WritableAtom } from "nanostores";

/** Shared values with exactly one owner each; everyone else gets a read-only store. */
export function createSharedState(): SharedStateService {
    const stores = new Map<string, WritableAtom<unknown>>();
    const owners = new Map<string, string>();
    const storeOf = (key: string) => {
        let store = stores.get(key);
        if (!store) {
            store = atom<unknown>(undefined);
            stores.set(key, store);
        }
        return store;
    };

    return {
        own(key, owner, initial) {
            const current = owners.get(key);
            if (current !== undefined && current !== owner) {
                throw new Error(`shared value "${key}" is owned by "${current}", not "${owner}"`);
            }
            const store = storeOf(key);
            if (current === undefined) {
                owners.set(key, owner);
                store.set(initial);
            }
            return value => store.set(value);
        },
        read: key => storeOf(key) as never
    };
}
