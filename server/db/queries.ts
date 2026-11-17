/** Read queries for the API. Every query is parameterized; user input never touches SQL text. */
import type { GameDetail, GameSummary, GameType, HomeSections, PriceChange, StoreListing } from "../../src/types.js";
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

  const points = await db.query<{
    store_id: string;
    url: string | null;
    available: boolean;
    ts: string;
    price_cents: number;
    regular_cents: number;
    cut: number;
  }>(
    `SELECT l.store_id, l.url, l.available, ${iso("p.recorded_at")} AS ts, p.price_cents, p.regular_cents, p.cut
     FROM listings l
     JOIN stores st USING (store_id)
     JOIN price_points p USING (listing_id)
     WHERE l.game_id = $1
     ORDER BY st.sort_order, p.recorded_at`,
    [game.game_id],
  );

  const listings = new Map<string, StoreListing>();
  for (const p of points) {
    let listing = listings.get(p.store_id);
    if (!listing) {
      listing = { storeId: p.store_id, url: p.url, available: p.available, history: [] };
      listings.set(p.store_id, listing);
    }
    listing.history.push({ timestamp: p.ts, priceCents: p.price_cents, regularCents: p.regular_cents, cut: p.cut });
  }

  return {
    slug: game.slug,
    title: game.title,
    type: game.type,
    coverUrl: game.cover_url,
    developer: game.developer,
    releaseDate: game.release_date,
    baseGame: game.base_slug ? { slug: game.base_slug, title: game.base_title! } : null,
    sourceUrl: game.source_url,
    listings: [...listings.values()],
  };
}

export async function getHomeSections(db: Queryable): Promise<HomeSections> {
  const [stats] = await db.query<{ games: number; stores: number; price_changes: number }>(
    `SELECT (SELECT count(*)::int FROM games) AS games,
            (SELECT count(DISTINCT store_id)::int FROM listings) AS stores,
            (SELECT count(*)::int FROM price_points) AS price_changes`,
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

  const newReleases = await db.query<SummaryRow & Row>(
    `SELECT ${SUMMARY_COLUMNS} FROM games g LEFT JOIN game_stats s USING (game_id)
     WHERE g.release_date IS NOT NULL AND g.release_date <= CURRENT_DATE
     ORDER BY g.release_date DESC
     LIMIT 10`,
  );

  // Latest real price changes: take the newest points, then look up the
  // price each one replaced (LATERAL = "for each row, run this subquery").
  const changes = await db.query<{
    slug: string;
    title: string;
    type: GameType;
    cover_url: string | null;
    store_id: string;
    ts: string;
    price_cents: number;
    regular_cents: number;
    cut: number;
    previous_cents: number;
  }>(
    `SELECT g.slug, g.title, g.type, g.cover_url, l.store_id, ${iso("p.recorded_at")} AS ts,
            p.price_cents, p.regular_cents, p.cut, prev.price_cents AS previous_cents
     FROM (SELECT * FROM price_points WHERE recorded_at <= now() ORDER BY recorded_at DESC LIMIT 50) p
     JOIN LATERAL (
       SELECT q.price_cents FROM price_points q
       WHERE q.listing_id = p.listing_id AND q.recorded_at < p.recorded_at
       ORDER BY q.recorded_at DESC LIMIT 1
     ) prev ON prev.price_cents <> p.price_cents
     JOIN listings l ON l.listing_id = p.listing_id
     JOIN games g ON g.game_id = l.game_id
     ORDER BY p.recorded_at DESC
     LIMIT 10`,
  );

  return {
    stats: { games: stats!.games, stores: stats!.stores, priceChanges: stats!.price_changes },
    biggestSales: biggestSales.map(toSummary),
    atHistoricalLow: atLow.map(toSummary),
    newReleases: newReleases.map(toSummary),
    latestChanges: changes.map(
      (c): PriceChange => ({
        game: { slug: c.slug, title: c.title, type: c.type, coverUrl: c.cover_url },
        storeId: c.store_id,
        timestamp: c.ts,
        priceCents: c.price_cents,
        regularCents: c.regular_cents,
        cut: c.cut,
        previousCents: c.previous_cents,
      }),
    ),
  };
}

type Row = Record<string, unknown>;
