/** The catalog's reading of shared URL state: "/audio" is a category, "/" or anything else shows all. */
export function categoryOf(path: string): string | undefined {
    const segment = path.split("/").filter(Boolean)[0];
    return segment && ["audio", "wearables", "home"].includes(segment) ? segment : undefined;
}

export function isVisible(card: { category?: string; name?: string }, path: string, search = ""): boolean {
    const category = categoryOf(path);
    const needle = search.trim().toLowerCase();
    return (!category || card.category === category) && (!needle || !!card.name?.includes(needle));
}
