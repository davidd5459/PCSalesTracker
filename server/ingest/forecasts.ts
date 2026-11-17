/**
 * Precompute sale forecasts into game_forecasts, using the same forecasting
 * code the game page runs in the browser (src/lib/salePrediction.ts).
 */
import { forecastSales } from "../../src/lib/salePrediction.js";
import type { Queryable } from "../db/client.js";
import { loadListings } from "../db/queries.js";

/** Games per history query; keeps each query's result a manageable size. */
const BATCH = 50;

/**
 * Recompute forecasts for the given games, or for every game when omitted.
 * Games with no likely next sale get their old forecast removed.
 * Returns how many games now have a forecast.
 */
export async function refreshForecasts(db: Queryable, gameIds?: number[], now = Date.now()): Promise<number> {
  const ids =
    gameIds ?? (await db.query<{ game_id: number }>("SELECT game_id FROM games ORDER BY game_id")).map((r) => r.game_id);
  let stored = 0;

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const listings = await loadListings(db, batch);

    const rows = batch.flatMap((gameId) => {
      const next = forecastSales(listings.get(gameId) ?? [], now)?.next;
      return next ? [{ gameId, ...next }] : [];
    });

    await db.query("DELETE FROM game_forecasts WHERE game_id = ANY($1::int[])", [batch]);
    if (rows.length > 0) {
      await db.query(
        `INSERT INTO game_forecasts
           (game_id, next_sale_at, label, basis, chance, typical_cut, expected_price_cents, computed_at)
         SELECT *, now() FROM unnest($1::int[], $2::timestamptz[], $3::text[], $4::text[],
                                      $5::real[], $6::smallint[], $7::int[])`,
        [
          rows.map((r) => r.gameId),
          rows.map((r) => new Date(r.expectedStart).toISOString()),
          rows.map((r) => r.label),
          rows.map((r) => r.basis),
          rows.map((r) => r.chance),
          rows.map((r) => r.typicalCut),
          rows.map((r) => r.expectedPriceCents),
        ],
      );
    }
    stored += rows.length;
  }
  return stored;
}
