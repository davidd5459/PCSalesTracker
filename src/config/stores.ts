/**
 * Store registry. To support a new store, add one entry here
 * (and, from chunk 2 on, a matching row in the `stores` table).
 * Order here is the display order across the app.
 */
export interface StoreInfo {
  id: string;
  name: string;
  /** Line/legend color; chosen to stay distinct on the dark background. */
  color: string;
  homepage: string;
}

export const STORES: readonly StoreInfo[] = [
  { id: "steam", name: "Steam", color: "#60a5fa", homepage: "https://store.steampowered.com" },
  { id: "gog", name: "GOG", color: "#c084fc", homepage: "https://www.gog.com" },
  { id: "epic", name: "Epic Games", color: "#e2e8f0", homepage: "https://store.epicgames.com" },
  { id: "humble", name: "Humble", color: "#f87171", homepage: "https://www.humblebundle.com/store" },
  { id: "fanatical", name: "Fanatical", color: "#fb923c", homepage: "https://www.fanatical.com" },
  { id: "gmg", name: "Green Man Gaming", color: "#4ade80", homepage: "https://www.greenmangaming.com" },
];

const byId = new Map(STORES.map((s) => [s.id, s]));

/** Look up a store, with a neutral fallback so unknown stores still render. */
export function getStore(id: string): StoreInfo {
  return byId.get(id) ?? { id, name: id, color: "#94a3b8", homepage: "" };
}

/** Sort comparator that follows registry order (unknown stores go last). */
export function compareStores(a: string, b: string): number {
  const ia = STORES.findIndex((s) => s.id === a);
  const ib = STORES.findIndex((s) => s.id === b);
  return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
}
