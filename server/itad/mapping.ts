/** Pure functions converting ITAD responses into our records. No I/O, easy to test. */
import type { GameType, PricePoint } from "../../src/types.js";
import type { GameRecord } from "../db/writes.js";
import type { GameInfo, HistoryEntry, PriceEntry } from "./schemas.js";

/**
 * Our game type for an ITAD type, or null for types we don't track (bundles,
 * etc.). Some real games have no type set at ITAD, so a missing type counts as a game.
 */
export function mapGameType(itadType: string | null): GameType | null {
  if (itadType === null || itadType === "game") return "game";
  if (itadType === "dlc") return "dlc";
  return null;
}

/** Map ITAD game info to a game record, or null for types we don't track. */
export function mapGameInfo(info: GameInfo): GameRecord | null {
  const type = mapGameType(info.type);
  if (!type) return null;
  const assets = info.assets && !Array.isArray(info.assets) ? info.assets : {};
  const releaseDate = info.releaseDate && /^\d{4}-\d{2}-\d{2}/.test(info.releaseDate) ? info.releaseDate.slice(0, 10) : null;
  return {
    itadId: info.id,
    slug: info.slug,
    title: info.title,
    type,
    steamAppId: info.appid ?? null,
    coverUrl: assets.banner600 ?? assets.banner400 ?? assets.banner300 ?? assets.boxart ?? null,
    developer: info.developers?.[0]?.name ?? null,
    releaseDate,
    isMature: info.mature ?? false,
    sourceUrl: info.urls?.game ?? `https://isthereanydeal.com/game/${info.slug}/info/`,
  };
}

/**
 * Group a game's price log by our store ids, oldest first, keeping only
 * tracked shops, USD prices, and actual changes.
 * Entries with no deal (game unavailable at the shop) are skipped for now.
 */
export function mapHistory(entries: HistoryEntry[], storeIdByShop: Map<number, string>): Map<string, PricePoint[]> {
  const byStore = new Map<string, PricePoint[]>();
  const sorted = [...entries].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  for (const e of sorted) {
    const storeId = storeIdByShop.get(e.shop.id);
    if (!storeId || !e.deal || e.deal.price.currency !== "USD") continue;
    const point: PricePoint = {
      timestamp: new Date(e.timestamp).toISOString(),
      priceCents: e.deal.price.amountInt,
      regularCents: e.deal.regular.amountInt,
      cut: Math.min(100, Math.max(0, Math.round(e.deal.cut))),
    };
    const list = byStore.get(storeId) ?? [];
    const last = list.at(-1);
    const unchanged =
      last && last.priceCents === point.priceCents && last.regularCents === point.regularCents && last.cut === point.cut;
    const sameMoment = last && last.timestamp === point.timestamp;
    if (sameMoment) list[list.length - 1] = point; // keep the later of two same-second entries
    else if (!unchanged) list.push(point);
    byStore.set(storeId, list);
  }
  return byStore;
}

/** Store URLs from a prices response, kept exactly as provided (per ITAD's terms). */
export function mapDealUrls(entry: PriceEntry | undefined, storeIdByShop: Map<number, string>): Map<string, string> {
  const urls = new Map<string, string>();
  for (const deal of entry?.deals ?? []) {
    const storeId = storeIdByShop.get(deal.shop.id);
    if (storeId) urls.set(storeId, deal.url);
  }
  return urls;
}
