import type { ModuleProps } from "@showcase/contracts";

// Copied into each micro frontend on purpose: they share contracts, not runtime code.

export function requireRoot(props?: ModuleProps): HTMLElement {
    if (!props?.root) {
        throw new Error("module started without a root element");
    }
    return props.root;
}

/** Adds this module's styles while it runs; they go away when the sandbox signal aborts. */
export function adoptStyles(css: string, signal: AbortSignal): void {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    signal.addEventListener("abort", () => style.remove(), { once: true });
}
