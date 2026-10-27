import { parseLines, type CartLine } from "./cart.ts";

const KEY = "showcase.cart.v1";

/**
 * The cart team's backend. Here it is the browser's storage; in production it would be an
 * HTTP API owned by the same team. Either way, no other micro frontend talks to it.
 */
export const cartBackend = {
    async load(): Promise<CartLine[]> {
        try {
            return parseLines(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
        } catch {
            return [];
        }
    },
    async save(lines: readonly CartLine[]): Promise<void> {
        try {
            localStorage.setItem(KEY, JSON.stringify(lines));
        } catch {
            // Storage unavailable (private mode, quota): the cart keeps working in memory.
        }
    }
};
