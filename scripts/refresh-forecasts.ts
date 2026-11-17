/** npm run db:forecasts — recompute every game's sale forecast (the daily sync also does this). */
import { createPoolDb } from "../server/db/client.js";
import { loadEnv, requireEnv } from "../server/env.js";
import { refreshForecasts } from "../server/ingest/forecasts.js";

loadEnv();
const db = createPoolDb(requireEnv("DATABASE_URL"));
try {
  const started = Date.now();
  const count = await refreshForecasts(db);
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s: ${count} games have a likely next sale.`);
} finally {
  await db.close();
}
