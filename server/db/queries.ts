/** Read queries for the API. Every query is parameterized; user input never touches SQL text. */
import type {
  GameDetail,
  GameSummary,
  GameType,
  HomeSections,
  MajorSale,
  StoreListing,
  UpcomingSale,
} from "../../src/types.js";
import type { Queryable } from "./client.js";

/** Format a timestamptz as ISO 8601 UTC in SQL, so every driver returns the same string. */
const iso = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

const SUMMARY_COLUMNS = `
  g.slug, g.title, g.type, g.cover_url,
  to_char(g.release_date, 'YYYY-MM-DD') AS release_date,
  s.best_store_id, s.best_price_cents, s.best_regular_cents, s.best_cut, s.best_url,
  s.low_store_id, s.low_price_cents, ${iso("s.low_recorded_at")} AS low_recorded_at,
  COALESCE(s.is_at_low, FALSE) AS is_at_low`;

interface SummaryRow {
  slug: string;
  title: string;
  type: GameType;
  cover_url: string | null;
  release_date: string | null;
  best_store_id: string | null;
  best_price_cents: number | null;
  best_regular_cents: number | null;
  best_cut: number | null;
  best_url: string | null;
  low_store_id: string | null;
  low_price_cents: number | null;
  low_recorded_at: string | null;
  is_at_low: boolean;
}

function toSummary(r: SummaryRow): GameSummary {
  return {
    slug: r.slug,
    title: r.title,
    type: r.type,
    coverUrl: r.cover_url,
    releaseDate: r.release_date,
    bestDeal:
      r.best_store_id === null
        ? null
        : {
            storeId: r.best_store_id,
            priceCents: r.best_price_cents!,
            regularCents: r.best_regular_cents!,
            cut: r.best_cut!,
            url: r.best_url,
          },
    historicalLow:
      r.low_store_id === null
        ? null
        : { storeId: r.low_store_id, priceCents: r.low_price_cents!, timestamp: r.low_recorded_at! },
    isAtHistoricalLow: r.is_at_low,
  };
}

/** Escape LIKE wildcards so user input is matched literally. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

export async function searchGames(db: Queryable, query: string, limit: number): Promise<GameSummary[]> {
  const q = query.trim();
  const rows = await db.query<SummaryRow & Row>(
    `SELECT ${SUMMARY_COLUMNS}
     FROM games g
     LEFT JOIN game_stats s USING (game_id)
     WHERE g.title ILIKE $1 OR $2::text <% g.title
     ORDER BY lower(g.title) = lower($2::text) DESC,   -- exact match
              g.title ILIKE $3 DESC,                   -- prefix match
              word_similarity($2::text, g.title) DESC, -- fuzzy closeness
              g.type = 'dlc',                          -- base games before DLC
              g.title
     LIMIT $4`,
    [`%${escapeLike(q)}%`, q, `${escapeLike(q)}%`, limit],
  );
  return rows.map(toSummary);
}

export async function getGame(db: Queryable, slug: string): Promise<GameDetail | null> {
  const [game] = await db.query<{
    game_id: number;
    slug: string;
    title: string;
    type: GameType;
    cover_url: string | null;
    developer: string | null;
    release_date: string | null;
    source_url: string | null;
    base_slug: string | null;
    base_title: string | null;
  }>(
    `SELECT g.game_id, g.slug, g.title, g.type, g.cover_url, g.developer,
            to_char(g.release_date, 'YYYY-MM-DD') AS release_date, g.source_url,
            b.slug AS base_slug, b.title AS base_title
     FROM games g
     LEFT JOIN games b ON b.game_id = g.base_game_id
     WHERE g.slug = $1`,
    [slug],
  );
  if (!game) return null;
  const listings = (await loadListings(db, [game.game_id])).get(game.game_id) ?? [];

  return {
    slug: game.slug,
    title: game.title,
    type: game.type,
    coverUrl: game.cover_url,
    developer: game.developer,
    releaseDate: game.release_date,
    baseGame: game.base_slug ? { slug: game.base_slug, title: game.base_title! } : null,
    sourceUrl: game.source_url,
    listings,
  };
}

/** Full price history for several games, grouped by game then store (store display order, oldest first). */
export async function loadListings(db: Queryable, gameIds: number[]): Promise<Map<number, StoreListing[]>> {
  const points = await db.query<{
    game_id: number;
    store_id: string;
    url: string | null;
    available: boolean;
    ts: string;
    price_cents: number;
    regular_cents: number;
    cut: number;
  }>(
    `SELECT l.game_id, l.store_id, l.url, l.available, ${iso("p.recorded_at")} AS ts,
            p.price_cents, p.regular_cents, p.cut
     FROM listings l
     JOIN stores st USING (store_id)
     JOIN price_points p USING (listing_id)
     WHERE l.game_id = ANY($1::int[])
     ORDER BY l.game_id, st.sort_order, p.recorded_at`,
    [gameIds],
  );

  const byGame = new Map<number, Map<string, StoreListing>>();
  for (const p of points) {
    let stores = byGame.get(p.game_id);
    if (!stores) byGame.set(p.game_id, (stores = new Map()));
    let listing = stores.get(p.store_id);
    if (!listing) {
      listing = { storeId: p.store_id, url: p.url, available: p.available, history: [] };
      stores.set(p.store_id, listing);
    }
    listing.history.push({ timestamp: p.ts, priceCents: p.price_cents, regularCents: p.regular_cents, cut: p.cut });
  }
  return new Map([...byGame].map(([id, stores]) => [id, [...stores.values()]]));
}

/** Slugs of the given ITAD ids that we already track, keyed by ITAD id. */
export async function trackedSlugs(db: Queryable, itadIds: string[]): Promise<Map<string, string>> {
  if (itadIds.length === 0) return new Map();
  const rows = await db.query<{ itad_id: string; slug: string }>(
    "SELECT itad_id::text, slug FROM games WHERE itad_id = ANY($1::uuid[])",
    [itadIds],
  );
  return new Map(rows.map((r) => [r.itad_id, r.slug]));
}

/** ITAD shop id → our store id, from the stores table. */
export async function storeIdsByShop(db: Queryable): Promise<Map<number, string>> {
  const rows = await db.query<{ itad_shop_id: number; store_id: string }>(
    "SELECT itad_shop_id, store_id FROM stores WHERE itad_shop_id IS NOT NULL",
  );
  return new Map(rows.map((r) => [r.itad_shop_id, r.store_id]));
}

/** Games expected to go on sale within the next `days` days that aren't on sale now. */
export async function getUpcomingSales(db: Queryable, days = 45, limit = 10): Promise<UpcomingSale[]> {
  const rows = await db.query<
    SummaryRow & {
      next_sale_at: string;
      label: string;
      chance: number | null;
      typical_cut: number | null;
      expected_price_cents: number | null;
    } & Row
  >(
    `SELECT ${SUMMARY_COLUMNS}, ${iso("f.next_sale_at")} AS next_sale_at, f.label, f.chance,
            f.typical_cut, f.expected_price_cents
     FROM game_forecasts f
     JOIN games g USING (game_id)
     LEFT JOIN game_stats s USING (game_id)
     WHERE f.next_sale_at > now()
       AND f.next_sale_at < now() + make_interval(days => $1)
       AND (f.chance IS NULL OR f.chance >= 0.5)
       AND COALESCE(s.best_cut, 0) < 10   -- already on sale: it's in "Biggest discounts" instead
     ORDER BY f.next_sale_at::date, f.chance DESC NULLS LAST, f.typical_cut DESC NULLS LAST, g.title
     LIMIT $2`,
    [days, limit],
  );
  return rows.map((r) => ({
    game: toSummary(r),
    expectedStart: r.next_sale_at,
    label: r.label,
    chance: r.chance,
    typicalCut: r.typical_cut,
    expectedPriceCents: r.expected_price_cents,
  }));
}

/**
 * The next big sale season for most games: the season that the most games'
 * forecasts point to next, within the coming four months. Its date is the
 * median of those games' expected start dates.
 */
export async function getNextMajorSale(db: Queryable): Promise<MajorSale | null> {
  const [row] = await db.query<{ label: string; games: number; expected: string; typical_cut: number | null }>(
    `SELECT f.label, count(*)::int AS games,
            ${iso("percentile_disc(0.5) WITHIN GROUP (ORDER BY f.next_sale_at)")} AS expected,
            percentile_disc(0.5) WITHIN GROUP (ORDER BY f.typical_cut) AS typical_cut
     FROM game_forecasts f
     WHERE f.basis = 'event' AND f.next_sale_at > now() AND f.next_sale_at < now() + interval '120 days'
     GROUP BY f.label
     ORDER BY count(*) DESC, min(f.next_sale_at)
     LIMIT 1`,
  );
  if (!row) return null;
  return { label: row.label, expectedStart: row.expected, games: row.games, typicalCut: row.typical_cut };
}

export async function getHomeSections(db: Queryable): Promise<HomeSections> {
  const [stats] = await db.query<{ games: number; on_sale: number }>(
    `SELECT (SELECT count(*)::int FROM games) AS games,
            (SELECT count(*)::int FROM game_stats WHERE best_cut >= 10) AS on_sale`,
  );

  const biggestSales = await db.query<SummaryRow & Row>(
    `SELECT ${SUMMARY_COLUMNS} FROM game_stats s JOIN games g USING (game_id)
     WHERE s.best_cut > 0
     ORDER BY s.best_cut DESC, s.best_price_cents
     LIMIT 10`,
  );

  const atLow = await db.query<SummaryRow & Row>(
    `SELECT ${SUMMARY_COLUMNS} FROM game_stats s JOIN games g USING (game_id)
     WHERE s.best_cut > 0 AND s.is_at_low
     ORDER BY s.best_cut DESC, s.best_price_cents
     LIMIT 10`,
  );

  return {
    stats: { games: stats!.games, onSale: stats!.on_sale },
    nextMajorSale: await getNextMajorSale(db),
    upcomingSales: await getUpcomingSales(db),
    biggestSales: biggestSales.map(toSummary),
    atHistoricalLow: atLow.map(toSummary),
  };
}

type Row = Record<string, unknown>;
