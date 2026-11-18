import { compareStores } from "../config/stores.js";
import type { Deal, GameDetail, GameSummary, HistoricalLow, PricePoint, StoreListing } from "../types.js";

/** The latest price point for a listing, or null if it has no history. */
export function currentPoint(listing: StoreListing): PricePoint | null {
  return listing.history.at(-1) ?? null;
}

/** Current price at every store that still sells the game, cheapest first (ties follow store order). */
export function currentDeals(listings: StoreListing[]): Deal[] {
  const deals: Deal[] = [];
  for (const listing of listings) {
    if (!listing.available) continue;
    const point = currentPoint(listing);
    if (!point) continue;
    deals.push({
      storeId: listing.storeId,
      priceCents: point.priceCents,
      regularCents: point.regularCents,
      cut: point.cut,
      url: listing.url,
    });
  }
  return deals.sort((a, b) => a.priceCents - b.priceCents || compareStores(a.storeId, b.storeId));
}

/** Lowest price in one listing's history (most recent occurrence wins ties). */
export function listingLow(listing: StoreListing): PricePoint | null {
  let low: PricePoint | null = null;
  for (const point of listing.history) {
    if (!low || point.priceCents <= low.priceCents) low = point;
  }
  return low;
}

/** Lowest price ever recorded across all stores (most recent occurrence wins ties). */
export function historicalLow(listings: StoreListing[]): HistoricalLow | null {
  let best: HistoricalLow | null = null;
  for (const listing of listings) {
    const low = listingLow(listing);
    if (!low) continue;
    const isLower = !best || low.priceCents < best.priceCents;
    const isSameButNewer = best && low.priceCents === best.priceCents && low.timestamp > best.timestamp;
    if (isLower || isSameButNewer) {
      best = { storeId: listing.storeId, priceCents: low.priceCents, timestamp: low.timestamp };
    }
  }
  return best;
}

/** One row of the price change log: a price point plus the price it replaced. */
export interface LogEntry extends PricePoint {
  storeId: string;
  previous: PricePoint | null;
}

/** Every price change across all stores, newest first. */
export function priceLog(listings: StoreListing[]): LogEntry[] {
  return listings
    .flatMap((l) => l.history.map((p, i) => ({ ...p, storeId: l.storeId, previous: l.history[i - 1] ?? null })))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
}

export function summarize(game: GameDetail): GameSummary {
  const bestDeal = currentDeals(game.listings)[0] ?? null;
  const low = historicalLow(game.listings);
  return {
    slug: game.slug,
    title: game.title,
    type: game.type,
    coverUrl: game.coverUrl,
    releaseDate: game.releaseDate,
    bestDeal,
    historicalLow: low,
    isAtHistoricalLow: Boolean(bestDeal && low && bestDeal.priceCents <= low.priceCents),
  };
}
