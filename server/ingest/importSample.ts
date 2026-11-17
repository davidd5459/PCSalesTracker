/** Loads the generated sample games into a database (for tests and trying the API before ITAD is set up). */
import { STORES } from "../../src/config/stores.js";
import { getSampleGames } from "../../src/data/sampleData.js";
import type { Db } from "../db/client.js";
import { refreshForecasts } from "./forecasts.js";
import { refreshGameStats, saveListingHistory, upsertGame, upsertStores } from "../db/writes.js";

export async function importSampleGames(db: Db): Promise<number> {
  await upsertStores(
    db,
    STORES.map((s, i) => ({ storeId: s.id, name: s.name, itadShopId: s.itad?.shopId ?? null, sortOrder: i })),
  );
  const games = getSampleGames();
  await db.transaction(async (tx) => {
    const ids = new Map<string, number>();
    for (const g of games) {
      const gameId = await upsertGame(tx, {
        itadId: null,
        slug: g.slug,
        title: g.title,
        type: g.type,
        steamAppId: null,
        coverUrl: g.coverUrl,
        developer: g.developer,
        releaseDate: g.releaseDate,
        isMature: false,
        sourceUrl: null,
      });
      ids.set(g.slug, gameId);
      for (const l of g.listings) {
        await saveListingHistory(tx, gameId, { storeId: l.storeId, url: l.url, available: l.available, points: l.history });
      }
    }
    for (const g of games) {
      if (g.baseGame) {
        await tx.query("UPDATE games SET base_game_id = $1 WHERE game_id = $2", [ids.get(g.baseGame.slug), ids.get(g.slug)]);
      }
    }
  });
  await refreshGameStats(db);
  await refreshForecasts(db);
  return games.length;
}
