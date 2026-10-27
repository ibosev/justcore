import { DestroyRef, inject, signal, type Signal } from "@angular/core";
import type { ReadableAtom } from "nanostores";

/** Mirrors a nanostores atom into an Angular signal for as long as the injecting component lives. */
export function fromStore<T>(store: ReadableAtom<T>): Signal<T> {
    const value = signal(store.get());
    inject(DestroyRef).onDestroy(store.listen(next => value.set(next)));
    return value.asReadonly();
}
