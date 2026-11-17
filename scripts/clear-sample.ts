/** npm run db:clear-sample: delete sample games (those without an ITAD id) from DATABASE_URL. */
import { createPoolDb } from "../server/db/client.js";
import { refreshGameStats } from "../server/db/writes.js";
import { loadEnv, requireEnv } from "../server/env.js";

loadEnv();
const db = createPoolDb(requireEnv("DATABASE_URL"));
try {
  // Listings and price points cascade-delete with their game.
  const rows = await db.query<{ n: number }>(
    "WITH del AS (DELETE FROM games WHERE itad_id IS NULL RETURNING 1) SELECT count(*)::int AS n FROM del",
  );
  await refreshGameStats(db);
  console.log(`Removed ${rows[0]!.n} sample games.`);
} finally {
  await db.close();
}
