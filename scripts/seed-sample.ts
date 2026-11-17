/** npm run db:seed-sample: load the generated sample games into DATABASE_URL (no ITAD key needed). */
import { createPoolDb } from "../server/db/client.js";
import { loadEnv, requireEnv } from "../server/env.js";
import { importSampleGames } from "../server/ingest/importSample.js";

loadEnv();
const db = createPoolDb(requireEnv("DATABASE_URL"));
try {
  const count = await importSampleGames(db);
  console.log(`Loaded ${count} sample games. Remove them before going live with: npm run db:clear-sample`);
} finally {
  await db.close();
}
