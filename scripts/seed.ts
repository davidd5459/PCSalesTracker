/**
 * npm run db:seed -- [--limit=200] [--refresh] [--include-mature]
 *
 * Imports the most popular games from IsThereAnyDeal with their full price
 * history. Resumable: games already imported are skipped unless --refresh.
 * Seeded games are protected: they're never evicted to make room for searched-for games.
 */
import { parseArgs } from "node:util";
import { createPoolDb } from "../server/db/client.js";
import { linkDlcToBaseGames, refreshGameStats } from "../server/db/writes.js";
import { loadEnv, requireEnv } from "../server/env.js";
import { refreshForecasts } from "../server/ingest/forecasts.js";
import { importGame } from "../server/ingest/importGame.js";
import { syncStores } from "../server/ingest/stores.js";
import { ItadClient } from "../server/itad/client.js";

const { values: args } = parseArgs({
  options: {
    limit: { type: "string", default: "200" },
    refresh: { type: "boolean", default: false },
    "include-mature": { type: "boolean", default: false },
  },
});
const limit = Math.max(1, Number(args.limit) || 200);

loadEnv();
const db = createPoolDb(requireEnv("DATABASE_URL"));
const itad = new ItadClient(requireEnv("ITAD_API_KEY"));
const started = Date.now();

try {
  console.log("Syncing stores…");
  const storeIdByShop = await syncStores(db, itad);
  console.log(`  tracking ${storeIdByShop.size} stores`);

  console.log(`Fetching the ${limit} most popular games…`);
  const ids: string[] = [];
  const PAGE = 100;
  for (let offset = 0; ids.length < limit; offset += PAGE) {
    const page = await itad.mostPopular(offset, Math.min(PAGE, limit - ids.length));
    if (page.length === 0) break;
    ids.push(...page.map((g) => g.id));
  }

  const done = new Set(
    args.refresh
      ? []
      : (
          await db.query<{ itad_id: string }>(
            "SELECT itad_id::text FROM games WHERE history_synced_at IS NOT NULL AND itad_id = ANY($1::uuid[])",
            [ids],
          )
        ).map((r) => r.itad_id),
  );
  const todo = ids.filter((id) => !done.has(id));
  console.log(`  ${done.size} already imported, ${todo.length} to import (~${Math.ceil((todo.length * 3 * 0.35) / 60)} min)`);

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let points = 0;
  for (const [i, id] of todo.entries()) {
    const prefix = `[${i + 1}/${todo.length}]`;
    try {
      const result = await importGame(db, itad, storeIdByShop, id, { includeMature: args["include-mature"], protect: true });
      if (result.status === "imported") {
        imported++;
        points += result.points;
        console.log(`${prefix} ${result.title}: ${result.stores} stores, ${result.points} new price points`);
      } else {
        skipped++;
        console.log(`${prefix} skipped ${id} (${result.reason})`);
      }
    } catch (err) {
      failed++;
      console.error(`${prefix} FAILED ${id}: ${(err as Error).message}`);
      if (failed >= 5 && imported === 0) throw new Error("Too many failures in a row; stopping. See errors above.");
    }
  }

  console.log(`Linked ${await linkDlcToBaseGames(db)} DLC to their base games`);
  console.log("Refreshing summary stats…");
  await refreshGameStats(db);
  console.log("Computing sale forecasts…");
  console.log(`  ${await refreshForecasts(db)} games have a likely next sale`);
  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`Done in ${mins} min: ${imported} imported, ${skipped} skipped, ${failed} failed, ${points} price points.`);
} finally {
  await db.close();
}
