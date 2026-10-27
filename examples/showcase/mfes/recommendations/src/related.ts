import type { Product } from "./api.ts";

/** Up to `limit` other products, the selected product's category first. None without a selection. */
export function related(products: readonly Product[], selectedId: string | undefined, limit = 3): Product[] {
    const selected = products.find(product => product.id === selectedId);
    if (!selected) {
        return [];
    }
    const others = products.filter(product => product !== selected);
    const sameCategory = others.filter(product => product.category === selected.category);
    return [...sameCategory, ...others.filter(product => product.category !== selected.category)].slice(0, limit);
}
