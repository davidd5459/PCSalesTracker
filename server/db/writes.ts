import type { GameType, PricePoint } from "../../src/types.js";
import type { Queryable } from "./client.js";

export interface StoreRecord {
  storeId: string;
  name: string;
  itadShopId: number | null;
  sortOrder: number;
}

export interface GameRecord {
  itadId: string | null;
  slug: string;
  title: string;
  type: GameType;
  steamAppId: number | null;
  coverUrl: string | null;
  developer: string | null;
  releaseDate: string | null;
  isMature: boolean;
  sourceUrl: string | null;
}

export interface ListingRecord {
  storeId: string;
  url: string | null;
  /** Whether the store currently sells the game. */
  available: boolean;
  /** Oldest first. */
  points: PricePoint[];
}

export async function upsertStores(db: Queryable, stores: StoreRecord[]): Promise<void> {
  await db.query(
    `INSERT INTO stores (store_id, name, itad_shop_id, sort_order)
     SELECT * FROM unnest($1::text[], $2::text[], $3::int[], $4::int[])
     ON CONFLICT (store_id) DO UPDATE
       SET name = EXCLUDED.name, itad_shop_id = EXCLUDED.itad_shop_id, sort_order = EXCLUDED.sort_order`,
    [
      stores.map((s) => s.storeId),
      stores.map((s) => s.name),
      stores.map((s) => s.itadShopId),
      stores.map((s) => s.sortOrder),
    ],
  );
}

/** Insert or update a game by slug; returns its game_id. */
export async function upsertGame(db: Queryable, g: GameRecord): Promise<number> {
  const rows = await db.query<{ game_id: number }>(
    `INSERT INTO games (itad_id, slug, title, type, steam_app_id, cover_url, developer, release_date, is_mature, source_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (slug) DO UPDATE SET
       itad_id = EXCLUDED.itad_id, title = EXCLUDED.title, type = EXCLUDED.type,
       steam_app_id = EXCLUDED.steam_app_id, cover_url = EXCLUDED.cover_url,
       developer = EXCLUDED.developer, release_date = EXCLUDED.release_date,
       is_mature = EXCLUDED.is_mature, source_url = EXCLUDED.source_url, updated_at = now()
     RETURNING game_id`,
    [g.itadId, g.slug, g.title, g.type, g.steamAppId, g.coverUrl, g.developer, g.releaseDate, g.isMature, g.sourceUrl],
  );
  return rows[0]!.game_id;
}

/**
 * Save a listing and append its price history. Idempotent: consecutive
 * identical prices are collapsed, and already-stored points are skipped.
 * Returns the number of new price points inserted.
 */
export async function saveListingHistory(db: Queryable, gameId: number, listing: ListingRecord): Promise<number> {
  const [row] = await db.query<{ listing_id: number }>(
    `INSERT INTO listings (game_id, store_id, url, available) VALUES ($1, $2, $3, $4)
     ON CONFLICT (game_id, store_id) DO UPDATE
       SET url = COALESCE(EXCLUDED.url, listings.url), available = EXCLUDED.available
     RETURNING listing_id`,
    [gameId, listing.storeId, listing.url, listing.available],
  );
  const listingId = row!.listing_id;
  if (listing.points.length === 0) return 0;

  // Compare against the point stored just before this batch so we only keep real changes.
  const [prev] = await db.query<{ price_cents: number; regular_cents: number; cut: number }>(
    `SELECT price_cents, regular_cents, cut FROM price_points
     WHERE listing_id = $1 AND recorded_at < $2
     ORDER BY recorded_at DESC LIMIT 1`,
    [listingId, listing.points[0]!.timestamp],
  );
  const points = collapseUnchanged(listing.points, prev ? toPoint(prev) : null);
  if (points.length === 0) return 0;

  const [result] = await db.query<{ inserted: number }>(
    `WITH ins AS (
       INSERT INTO price_points (listing_id, recorded_at, price_cents, regular_cents, cut)
       SELECT $1, * FROM unnest($2::timestamptz[], $3::int[], $4::int[], $5::smallint[])
       ON CONFLICT DO NOTHING
       RETURNING 1
     )
     SELECT count(*)::int AS inserted FROM ins`,
    [
      listingId,
      points.map((p) => p.timestamp),
      points.map((p) => p.priceCents),
      points.map((p) => p.regularCents),
      points.map((p) => p.cut),
    ],
  );
  return result!.inserted;
}

export async function markHistorySynced(db: Queryable, gameId: number): Promise<void> {
  await db.query("UPDATE games SET history_synced_at = now() WHERE game_id = $1", [gameId]);
}

/** Recompute the game_stats summary view without blocking readers. */
export async function refreshGameStats(db: Queryable): Promise<void> {
  await db.query("REFRESH MATERIALIZED VIEW CONCURRENTLY game_stats");
}

const toPoint = (r: { price_cents: number; regular_cents: number; cut: number }) => ({
  priceCents: r.price_cents,
  regularCents: r.regular_cents,
  cut: r.cut,
});

/** Drop points whose price, regular price and cut match the point before them. */
export function collapseUnchanged(
  points: PricePoint[],
  previous: Pick<PricePoint, "priceCents" | "regularCents" | "cut"> | null,
): PricePoint[] {
  const out: PricePoint[] = [];
  let last = previous;
  for (const p of points) {
    if (last && last.priceCents === p.priceCents && last.regularCents === p.regularCents && last.cut === p.cut) continue;
    out.push(p);
    last = p;
  }
  return out;
}
