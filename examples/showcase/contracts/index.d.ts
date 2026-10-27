import type { ReadableAtom } from "nanostores";
import type {} from "justcore";

/*
 * The contract between the shell and every micro frontend. Change it additively within a major
 * version: micro frontends are deployed independently and may be older or newer than the shell.
 */

/** Query values; set a key to undefined to remove it from the URL. */
export type QueryPatch = Readonly<Record<string, string | undefined>>;

/**
 * Shared state derived from the URL. The shell is the only code that writes history;
 * modules read the stores and ask for changes through the actions.
 */
export interface LocationService {
    /** e.g. "/wearables" */
    readonly $path: ReadableAtom<string>;
    /** e.g. { product: "halo-ring", q: "ring" } */
    readonly $query: ReadableAtom<Readonly<Record<string, string>>>;
    navigate(path: string, options?: { query?: QueryPatch; replace?: boolean }): void;
    setQuery(patch: QueryPatch, options?: { replace?: boolean }): void;
}

export interface CartSummary {
    count: number;
    /** In cents. */
    total: number;
}

/** Shared values other than the URL. Each has exactly one owning module. */
export interface SharedValues {
    /** Owned by the cart micro frontend. */
    "cart.summary": CartSummary;
}

export interface SharedStateService {
    /**
     * Claims a shared value and returns its writer. Throws if another module owns it.
     * The owner claiming it again, e.g. after a restart, keeps the current value.
     */
    own<K extends keyof SharedValues>(key: K, owner: string, initial: SharedValues[K]): (value: SharedValues[K]) => void;
    /** A read-only view; undefined until the owner claims the value. */
    read<K extends keyof SharedValues>(key: K): ReadableAtom<SharedValues[K] | undefined>;
}

/** The product snapshot a cart request carries. */
export interface CartProduct {
    id: string;
    name: string;
    /** In cents. */
    price: number;
    color: string;
}

/** Request, handled by the cart: "please add this". */
export interface CartAddMessage extends jc.Message {
    type: "cart.add";
    product: CartProduct;
    quantity: number;
}

/** Fact, published by the cart after it added an item. */
export interface CartItemAddedMessage extends jc.Message {
    type: "cart.itemAdded";
    productId: string;
    name: string;
    quantity: number;
}

/** Fact, published by the cart when an order is placed. */
export interface OrderPlacedMessage extends jc.Message {
    type: "order.placed";
    items: number;
    /** In cents. */
    total: number;
}

export type ShowcaseMessage = CartAddMessage | CartItemAddedMessage | OrderPlacedMessage;

declare global {
    namespace jc {
        interface ServiceLocatorMap {
            location: LocationService;
            shared: SharedStateService;
        }
    }
}

/** Every module gets the element it owns and must not touch the DOM outside it. */
export interface ModuleProps {
    root: HTMLElement;
}

/** What a micro frontend bundle default-exports. */
export type ShowcaseModuleFactory = (sandbox: jc.Sandbox) => jc.Module<ModuleProps>;
