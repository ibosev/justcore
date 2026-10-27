/** The navigation team's own menu. In production this could come from a CMS the team owns. */
export const links = [
    { path: "/", label: "All products", icon: "✦" },
    { path: "/audio", label: "Audio", icon: "♪" },
    { path: "/wearables", label: "Wearables", icon: "◷" },
    { path: "/home", label: "Home", icon: "⌂" }
] as const;

/** "/wearables/" and "/wearables" are the same section; anything unknown falls back to "/". */
export function activePath(path: string): string {
    const normalized = path.length > 1 ? path.replace(/\/+$/, "") : path;
    return links.some(link => link.path === normalized) ? normalized : "/";
}
