import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Db } from "./client.js";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../db/migrations/", import.meta.url));

/** Apply any migration files (db/migrations/*.sql) not yet recorded, in name order. */
export async function runMigrations(db: Db, log: (msg: string) => void = () => {}): Promise<string[]> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const rows = await db.query<{ version: string }>("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.version));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(MIGRATIONS_DIR + file, "utf8");
    // Each migration and its bookkeeping row commit together, or not at all.
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
    });
    log(`applied ${file}`);
    ran.push(file);
  }
  return ran;
}
