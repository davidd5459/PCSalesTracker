/**
 * npm run db:seed -- [--limit=200] [--refresh] [--include-mature]
 *
 * Imports popular games from IsThereAnyDeal (most popular, then most
 * waitlisted, then most collected; about 1,100 unique games in total) with their full price
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
import { ItadClient, type RankedList } from "../server/itad/client.js";

/** Lists to draw games from, most relevant first. */
const LISTS: RankedList[] = ["most-popular", "most-waitlisted", "most-collected"];

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

  // Merge ITAD's ranked lists in order until we have `limit` unique games.
  // Each list ends at position 600 (later offsets repeat its last page), so stop
  // reading a list once a page repeats that list. A page whose games all came
  // from an earlier list is normal (the lists overlap), so keep going past those.
  console.log(`Fetching up to ${limit} games from ITAD's ranked lists…`);
  const unique = new Set<string>();
  const PAGE = 100;
  for (const list of LISTS) {
    const before = unique.size;
    const seenInList = new Set<string>();
    for (let offset = 0; unique.size < limit; offset += PAGE) {
      const page = await itad.ranked(list, offset, PAGE);
      const fresh = page.filter((g) => !seenInList.has(g.id));
      if (fresh.length === 0) break; // end of this list
      for (const g of fresh) {
        seenInList.add(g.id);
        if (unique.size < limit) unique.add(g.id);
      }
    }
    console.log(`  ${list}: ${unique.size - before} new games`);
    if (unique.size >= limit) break;
  }
  const ids = [...unique];
  if (ids.length < limit) console.log(`  (ITAD's lists only cover ${ids.length} unique games)`);

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
