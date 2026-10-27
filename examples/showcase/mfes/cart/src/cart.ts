import type { CartProduct } from "@showcase/contracts";
import { atom, computed, type ReadableAtom } from "nanostores";

export interface CartLine {
    product: CartProduct;
    quantity: number;
}

/** The cart micro frontend's internal state. No other module can see or change it directly. */
export interface CartStore {
    readonly $lines: ReadableAtom<readonly CartLine[]>;
    readonly $count: ReadableAtom<number>;
    /** In cents. */
    readonly $total: ReadableAtom<number>;
    add(product: CartProduct, quantity?: number): void;
    /** Zero or less removes the line. */
    setQuantity(productId: string, quantity: number): void;
    clear(): void;
}

export function createCart(initial: readonly CartLine[] = []): CartStore {
    const $lines = atom<readonly CartLine[]>(initial);
    const $count = computed($lines, lines => lines.reduce((sum, line) => sum + line.quantity, 0));
    const $total = computed($lines, lines => lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0));

    const setQuantity = (productId: string, quantity: number) => {
        const lines = $lines.get();
        $lines.set(quantity > 0
            ? lines.map(line => line.product.id === productId ? { ...line, quantity } : line)
            : lines.filter(line => line.product.id !== productId));
    };

    return {
        $lines,
        $count,
        $total,
        add(product, quantity = 1) {
            if (!Number.isInteger(quantity) || quantity < 1) {
                throw new RangeError(`add(): quantity must be a positive integer, got ${quantity}`);
            }
            if (!Number.isInteger(product.price) || product.price < 0) {
                throw new RangeError(`add(): "${product.id}" has an invalid price`);
            }
            const existing = $lines.get().find(line => line.product.id === product.id);
            if (existing) {
                setQuantity(product.id, existing.quantity + quantity);
            } else {
                $lines.set([...$lines.get(), { product, quantity }]);
            }
        },
        setQuantity,
        clear: () => $lines.set([])
    };
}

/** Drops anything in stored data that is not a well-formed cart line. */
export function parseLines(data: unknown): CartLine[] {
    if (!Array.isArray(data)) {
        return [];
    }
    return data.filter((line): line is CartLine =>
        !!line && typeof line === "object" &&
        Number.isInteger(line.quantity) && line.quantity > 0 &&
        typeof line.product?.id === "string" && typeof line.product?.name === "string" &&
        Number.isInteger(line.product?.price) && typeof line.product?.color === "string");
}
