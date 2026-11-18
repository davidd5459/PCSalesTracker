/**
 * Daily sync: bring every tracked game's prices up to date, cheaply.
 *
 *   1. Ask for the current prices of all games, 100 per request
 *      (about 30 requests for 3,000 games).
 *   2. Compare them with the latest stored price at each store. Games where
 *      nothing changed are done; most games, most days.
 *   3. For games that changed, fetch price history since the last sync. That
 *      gives exact timestamps (and any changes in between) instead of stamping
 *      everything with the time the sync ran.
 *   4. Update store links and which stores still sell each game.
 *
 * Then link any new DLC, refresh the summary view, and recompute forecasts
 * (their "next sale" dates move as time passes even when prices don't).
 */
import type { Db } from "../db/client.js";
import { storeIdsByShop } from "../db/queries.js";
import { linkDlcToBaseGames, markHistorySynced, refreshGameStats, saveListingHistory } from "../db/writes.js";
import type { ItadClient } from "../itad/client.js";
import { mapHistory } from "../itad/mapping.js";
import type { PriceEntry } from "../itad/schemas.js";
import { refreshForecasts } from "./forecasts.js";
import { HISTORY_SINCE } from "./importGame.js";

const BATCH = 100;
const DAY = 86_400_000;
/** Re-read a few days before the last sync: the data source sometimes records changes late. */
const OVERLAP_DAYS = 3;

export interface SyncResult {
  checked: number;
  changed: number;
  points: number;
  failed: number;
  forecasts: number;
}

interface TrackedGame {
  game_id: number;
  itad_id: string;
  synced_ms: number | null;
}

interface StoredPrice {
  game_id: number;
  store_id: string;
  available: boolean;
  price_cents: number;
  regular_cents: number;
  cut: number;
}

interface CurrentPrice {
  priceCents: number;
  regularCents: number;
  cut: number;
  url: string;
}

export async function syncPrices(db: Db, itad: ItadClient, log: (msg: string) => void = console.log): Promise<SyncResult> {
  const storeIdByShop = await storeIdsByShop(db);
  const shops = [...storeIdByShop.keys()];
  const result: SyncResult = { checked: 0, changed: 0, points: 0, failed: 0, forecasts: 0 };

  const games = await db.query<TrackedGame & Record<string, unknown>>(
    `SELECT game_id, itad_id::text, (extract(epoch FROM history_synced_at) * 1000)::float8 AS synced_ms
     FROM games WHERE itad_id IS NOT NULL ORDER BY game_id`,
  );
  // Latest stored price at every listing (LATERAL: one index lookup per listing).
  const stored = await db.query<StoredPrice & Record<string, unknown>>(
    `SELECT l.game_id, l.store_id, l.available, p.price_cents, p.regular_cents, p.cut
     FROM listings l
     JOIN games g USING (game_id)
     JOIN LATERAL (
       SELECT price_cents, regular_cents, cut FROM price_points
       WHERE listing_id = l.listing_id ORDER BY recorded_at DESC LIMIT 1
     ) p ON TRUE
     WHERE g.itad_id IS NOT NULL`,
  );
  const storedByGame = new Map<number, StoredPrice[]>();
  for (const s of stored) storedByGame.set(s.game_id, [...(storedByGame.get(s.game_id) ?? []), s]);

  for (let i = 0; i < games.length; i += BATCH) {
    const batch = games.slice(i, i + BATCH);
    const prices = new Map((await itad.prices(batch.map((g) => g.itad_id), shops)).map((p) => [p.id, p]));

    for (const game of batch) {
      result.checked++;
      const entry = prices.get(game.itad_id);
      if (!entry) continue; // no answer for this game: leave it alone rather than guess
      const current = currentPrices(entry, storeIdByShop);
      if (!hasChanged(storedByGame.get(game.game_id) ?? [], current)) continue;

      result.changed++;
      try {
        result.points += await syncGame(db, itad, game, current, storeIdByShop, shops);
      } catch (err) {
        result.failed++;
        log(`  ! game ${game.itad_id}: ${(err as Error).message}`);
      }
    }
    log(`  checked ${Math.min(i + BATCH, games.length)}/${games.length} games, ${result.changed} changed`);
  }

  await linkDlcToBaseGames(db);
  await refreshGameStats(db);
  result.forecasts = await refreshForecasts(db);
  return result;
}

/** Current USD price at each of our stores, keyed by store id. */
function currentPrices(entry: PriceEntry, storeIdByShop: Map<number, string>): Map<string, CurrentPrice> {
  const current = new Map<string, CurrentPrice>();
  for (const deal of entry.deals) {
    const storeId = storeIdByShop.get(deal.shop.id);
    if (!storeId || deal.price.currency !== "USD") continue;
    current.set(storeId, {
      priceCents: deal.price.amountInt,
      regularCents: deal.regular.amountInt,
      cut: Math.round(deal.cut),
      url: deal.url,
    });
  }
  return current;
}

/** True if any store's price changed, a store started selling the game, or one stopped. */
export function hasChanged(stored: StoredPrice[], current: Map<string, CurrentPrice>): boolean {
  const storedById = new Map(stored.map((s) => [s.store_id, s]));
  for (const [storeId, now] of current) {
    const before = storedById.get(storeId);
    if (!before || !before.available) return true;
    if (before.price_cents !== now.priceCents || before.regular_cents !== now.regularCents || before.cut !== now.cut) {
      return true;
    }
  }
  return stored.some((s) => s.available && !current.has(s.store_id));
}

async function syncGame(
  db: Db,
  itad: ItadClient,
  game: TrackedGame,
  current: Map<string, CurrentPrice>,
  storeIdByShop: Map<number, string>,
  shops: number[],
): Promise<number> {
  const lastSync = game.synced_ms ?? Date.parse(HISTORY_SINCE);
  const since = new Date(Math.max(Date.parse(HISTORY_SINCE), lastSync - OVERLAP_DAYS * DAY)).toISOString();
  const byStore = mapHistory(await itad.history(game.itad_id, { shops, since }), storeIdByShop);

  return db.transaction(async (tx) => {
    let points = 0;
    for (const [storeId, storePoints] of byStore) {
      const now = current.get(storeId);
      points += await saveListingHistory(tx, game.game_id, {
        storeId,
        url: now?.url ?? null,
        available: Boolean(now),
        points: storePoints,
      });
    }
    // Refresh links and availability for every listing, including stores with no new history.
    const ids = [...current.keys()];
    await tx.query(
      `UPDATE listings l
       SET available = (c.store_id IS NOT NULL), url = COALESCE(c.url, l.url)
       FROM listings x
       LEFT JOIN unnest($2::text[], $3::text[]) AS c(store_id, url) ON c.store_id = x.store_id
       WHERE x.game_id = $1 AND l.listing_id = x.listing_id`,
      [game.game_id, ids, ids.map((id) => current.get(id)!.url)],
    );
    await markHistorySynced(tx, game.game_id);
    return points;
  });
}
