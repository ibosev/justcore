export interface Product {
    id: string;
    name: string;
    category: string;
    /** In cents. */
    price: number;
    description: string;
    color: string;
}

/** The product API is another team's service: validate what it returns before rendering it. */
export function parseProducts(data: unknown): Product[] {
    const list = (data as { products?: unknown } | null)?.products;
    if (!Array.isArray(list)) {
        throw new Error("product API returned no product list");
    }
    return list.filter((item): item is Product =>
        !!item && typeof item === "object" &&
        ["id", "name", "category", "description", "color"].every(key => typeof item[key] === "string") &&
        Number.isInteger(item.price) && item.price >= 0);
}

/** Resolved against this bundle's own URL, so the bundle talks to the API deployed next to it. */
const API_URL = new URL(/* @vite-ignore */ "/api/products.json", import.meta.url);

export async function fetchProducts(signal: AbortSignal): Promise<Product[]> {
    const response = await fetch(API_URL, { signal });
    if (!response.ok) {
        throw new Error(`product API responded with ${response.status}`);
    }
    return parseProducts(await response.json());
}
