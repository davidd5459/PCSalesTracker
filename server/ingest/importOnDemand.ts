/**
 * Import a game the moment a visitor asks for it (search → "not tracked yet").
 * This is what lets the catalog grow on its own instead of preloading every game.
 *
 * Anyone can trigger this, so it's limited: at most `perHour` new games an hour
 * (stops a script from churning the database). The database itself works like a
 * cache with a size cap: once it holds `maxGames`, each new game replaces the
 * least recently viewed one. Popular games from the bulk import are protected
 * and never replaced. Evicting is safe because the data source keeps the full
 * history; an evicted game is simply re-imported if someone looks it up again.
 */
import type { Db } from "../db/client.js";
import { storeIdsByShop, trackedSlugs } from "../db/queries.js";
import { evictLeastRecentlyViewed, linkDlcToBaseGames, refreshGameStats } from "../db/writes.js";
import type { ItadClient } from "../itad/client.js";
import { refreshForecasts } from "./forecasts.js";
import { importGame } from "./importGame.js";

export interface ImportLimits {
  /** New games per rolling hour, across all visitors. */
  perHour: number;
  /**
   * Replace games beyond this many. Measured ~67 KB per popular game (history,
   * indexes, forecasts), so 4,000 ≈ 270 MB plus ~8 MB of fixed Postgres overhead:
   * room for ~3,000 protected popular games and ~1,000 rotating searched-for ones.
   */
  maxGames: number;
  /** Also replace games once the database is this big, whatever the count (Neon's free tier is 0.5 GB). */
  maxBytes: number;
}

export const IMPORT_LIMITS: ImportLimits = {
  perHour: 60,
  maxGames: 4000,
  maxBytes: 400 * 1024 * 1024,
};

/** The import was refused; `status` is the HTTP status to answer with. */
export class ImportRefused extends Error {
  constructor(
    message: string,
    readonly status: 422 | 429 | 503,
  ) {
    super(message);
  }
}

/**
 * Import a game by ITAD id (or find it if already tracked) and return its slug.
 * `now` (milliseconds) is the date its sale forecast is made from.
 */
export async function importOnDemand(
  db: Db,
  itad: ItadClient,
  itadId: string,
  overrides: Partial<ImportLimits> = {},
  now = Date.now(),
): Promise<string> {
  const limits = { ...IMPORT_LIMITS, ...overrides };
  const existing = (await trackedSlugs(db, [itadId])).get(itadId);
  if (existing) return existing;

  const [counts] = await db.query<{ total: number; recent: number; evictable: number; bytes: string }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS recent,
            count(*) FILTER (WHERE NOT protected)::int AS evictable,
            pg_database_size(current_database())::text AS bytes
     FROM games`,
  );
  // Full by count (the planned budget) or by actual storage (the real limit).
  const full = counts!.total >= limits.maxGames || Number(counts!.bytes) >= limits.maxBytes;
  if (full && counts!.evictable === 0) {
    throw new ImportRefused("The catalog is full, so new games can't be added right now.", 503);
  }
  if (counts!.recent >= limits.perHour) {
    throw new ImportRefused("Lots of new games are being added right now. Please try again in a little while.", 429);
  }

  const stores = await storeIdsByShop(db);
  if (stores.size === 0) throw new Error("No stores are configured; run the seed script first.");

  const result = await importGame(db, itad, stores, itadId);
  if (result.status === "skipped") {
    throw new ImportRefused(`This title can't be tracked (${result.reason}).`, 422);
  }

  // Only make room once the new game is safely in, so a failed import never deletes anything.
  if (full) {
    const evicted = await evictLeastRecentlyViewed(db, result.gameId);
    if (evicted) console.log(`Evicted "${evicted}" (least recently viewed) to make room for "${result.slug}"`);
  }

  // Make it show up in search summaries and the home page straight away.
  await linkDlcToBaseGames(db);
  await refreshGameStats(db);
  await refreshForecasts(db, [result.gameId], now);
  return result.slug;
}
