/** npm run db:migrate: apply pending schema migrations to DATABASE_URL. */
import { createPoolDb } from "../server/db/client.js";
import { runMigrations } from "../server/db/migrate.js";
import { loadEnv, requireEnv } from "../server/env.js";

loadEnv();
const db = createPoolDb(requireEnv("DATABASE_URL"));
try {
  const ran = await runMigrations(db, (msg) => console.log(`  ${msg}`));
  console.log(ran.length ? `Done: ${ran.length} migration(s) applied.` : "Database is already up to date.");
} finally {
  await db.close();
}
