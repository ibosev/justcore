// Module metadata only, no framework code: shared by the page template and the client boot script.
export const moduleInfo = [
    { id: "header", framework: "Vue", remote: true },
    { id: "navigation", framework: "React", remote: true },
    { id: "catalog", framework: "Astro", remote: true },
    { id: "product-detail", framework: "Svelte", remote: true },
    { id: "recommendations", framework: "Angular", remote: true },
    { id: "cart", framework: "SolidJS", remote: true },
    { id: "inspector", framework: "plain DOM", remote: false }
] as const;

export type ModuleId = typeof moduleInfo[number]["id"];

/** The import map name a remote is loaded by, e.g. "mfe/cart". Keep in sync with scripts/importmap.mjs. */
export const specifierOf = (id: string) => `mfe/${id}`;

export function infoOf(id: ModuleId) {
    return moduleInfo.find(info => info.id === id)!;
}
