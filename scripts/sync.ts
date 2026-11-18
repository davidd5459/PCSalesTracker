/**
 * npm run db:sync — bring every tracked game's prices up to date.
 * Runs daily from GitHub Actions (.github/workflows/sync.yml); safe to run by hand.
 */
import { createPoolDb } from "../server/db/client.js";
import { loadEnv, requireEnv } from "../server/env.js";
import { syncPrices } from "../server/ingest/sync.js";
import { ItadClient } from "../server/itad/client.js";

loadEnv();
const db = createPoolDb(requireEnv("DATABASE_URL"));
const itad = new ItadClient(requireEnv("ITAD_API_KEY"));
const started = Date.now();

try {
  console.log("Syncing prices…");
  const r = await syncPrices(db, itad);
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(
    `Done in ${secs}s: ${r.checked} games checked, ${r.changed} changed, ${r.points} new price points, ` +
      `${r.failed} failed, ${r.forecasts} forecasts.`,
  );
  // A few one-off failures are normal; fail the run (so it shows red) only if many games failed.
  if (r.failed > Math.max(3, r.changed * 0.1)) {
    console.error("Too many games failed to sync.");
    process.exitCode = 1;
  }
} finally {
  await db.close();
}
