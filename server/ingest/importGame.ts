import type { Db } from "../db/client.js";
import { markHistorySynced, saveListingHistory, upsertGame } from "../db/writes.js";
import type { ItadClient } from "../itad/client.js";
import { mapDealUrls, mapGameInfo, mapHistory } from "../itad/mapping.js";

/** How far back to import history. */
export const HISTORY_SINCE = "2015-01-01T00:00:00Z";

export type ImportResult =
  | { status: "imported"; slug: string; title: string; stores: number; points: number }
  | { status: "skipped"; reason: string };

/**
 * Import one game from ITAD: metadata, full price history at our stores, and
 * current store links. Writes happen in one transaction, so a failure never
 * leaves a half-imported game. Safe to re-run (idempotent).
 */
export async function importGame(
  db: Db,
  itad: ItadClient,
  storeIdByShop: Map<number, string>,
  itadId: string,
  opts: { includeMature?: boolean } = {},
): Promise<ImportResult> {
  const info = await itad.info(itadId);
  const game = mapGameInfo(info);
  if (!game) return { status: "skipped", reason: `unsupported type "${info.type}"` };
  if (game.isMature && !opts.includeMature) return { status: "skipped", reason: "mature content" };

  const shops = [...storeIdByShop.keys()];
  const history = await itad.history(itadId, { shops, since: HISTORY_SINCE });
  const prices = await itad.prices([itadId], shops);

  const byStore = mapHistory(history, storeIdByShop);
  if (byStore.size === 0) return { status: "skipped", reason: "no price history at tracked stores" };
  // The current-prices response lists every store selling the game right now,
  // so a store missing from it has stopped selling the game.
  const urls = mapDealUrls(prices[0], storeIdByShop);

  return db.transaction(async (tx) => {
    const gameId = await upsertGame(tx, game);
    let points = 0;
    for (const [storeId, storePoints] of byStore) {
      points += await saveListingHistory(tx, gameId, {
        storeId,
        url: urls.get(storeId) ?? null,
        available: urls.has(storeId),
        points: storePoints,
      });
    }
    await markHistorySynced(tx, gameId);
    return { status: "imported", slug: game.slug, title: game.title, stores: byStore.size, points };
  });
}
