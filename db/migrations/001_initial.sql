-- PCSalesTracker initial schema.
-- All prices are integer cents (USD) to avoid floating-point rounding.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Stores we track. Mirrors src/config/stores.ts; synced by the seed script.
CREATE TABLE stores (
  store_id      TEXT PRIMARY KEY,                -- e.g. 'steam'
  name          TEXT NOT NULL,
  itad_shop_id  INTEGER UNIQUE,                  -- IsThereAnyDeal's shop id
  sort_order    INTEGER NOT NULL DEFAULT 0       -- display order and tie-breaker
);

-- One row per game or DLC.
CREATE TABLE games (
  game_id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  itad_id            UUID UNIQUE,                -- null for non-ITAD (sample/test) data
  slug               TEXT NOT NULL UNIQUE,       -- used in URLs: /game/:slug
  title              TEXT NOT NULL,
  type               TEXT NOT NULL CHECK (type IN ('game', 'dlc')),
  base_game_id       INTEGER REFERENCES games (game_id) ON DELETE SET NULL,
  steam_app_id       INTEGER,
  cover_url          TEXT,
  developer          TEXT,
  release_date       DATE,
  is_mature          BOOLEAN NOT NULL DEFAULT FALSE,
  source_url         TEXT,                       -- link back to the data source's page
  history_synced_at  TIMESTAMPTZ,                -- null until full history is imported
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigram index: fast fuzzy / substring title search (ILIKE '%q%', word similarity).
CREATE INDEX games_title_trgm_idx ON games USING GIN (title gin_trgm_ops);
CREATE INDEX games_release_date_idx ON games (release_date DESC) WHERE release_date IS NOT NULL;

-- A game's presence at one store.
CREATE TABLE listings (
  listing_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id     INTEGER NOT NULL REFERENCES games (game_id) ON DELETE CASCADE,
  store_id    TEXT NOT NULL REFERENCES stores (store_id),
  url         TEXT,
  UNIQUE (game_id, store_id)
);

-- Price change log. Only changes are stored: a price holds until the next row.
-- The composite primary key doubles as the time-series index (listing, time)
-- and makes re-imports idempotent (ON CONFLICT DO NOTHING).
CREATE TABLE price_points (
  listing_id     INTEGER NOT NULL REFERENCES listings (listing_id) ON DELETE CASCADE,
  recorded_at    TIMESTAMPTZ NOT NULL,
  price_cents    INTEGER NOT NULL CHECK (price_cents >= 0),
  regular_cents  INTEGER NOT NULL CHECK (regular_cents >= 0),
  cut            SMALLINT NOT NULL CHECK (cut BETWEEN 0 AND 100),
  PRIMARY KEY (listing_id, recorded_at)
);

-- For "latest price changes across all games".
CREATE INDEX price_points_recorded_at_idx ON price_points (recorded_at DESC);

-- Per-game summary: best current deal and all-time low.
-- Materialized so list pages don't scan the whole price log on every request;
-- refreshed after each import/sync (REFRESH MATERIALIZED VIEW CONCURRENTLY).
CREATE MATERIALIZED VIEW game_stats AS
WITH latest AS (
  -- Current price at each listing = its most recent price point.
  SELECT DISTINCT ON (p.listing_id)
         l.game_id, l.store_id, l.url, p.price_cents, p.regular_cents, p.cut
  FROM price_points p
  JOIN listings l USING (listing_id)
  ORDER BY p.listing_id, p.recorded_at DESC
),
best_current AS (
  -- Rank each game's current prices; rank 1 is the best deal right now.
  SELECT latest.*,
         ROW_NUMBER() OVER (PARTITION BY latest.game_id ORDER BY latest.price_cents, st.sort_order) AS rn
  FROM latest
  JOIN stores st USING (store_id)
),
lows AS (
  -- Rank every price ever recorded; rank 1 is the all-time low
  -- (most recent occurrence wins ties, so "last seen" is accurate).
  SELECT l.game_id, l.store_id, p.price_cents, p.recorded_at,
         ROW_NUMBER() OVER (PARTITION BY l.game_id ORDER BY p.price_cents, p.recorded_at DESC) AS rn
  FROM price_points p
  JOIN listings l USING (listing_id)
)
SELECT g.game_id,
       b.store_id       AS best_store_id,
       b.price_cents    AS best_price_cents,
       b.regular_cents  AS best_regular_cents,
       b.cut            AS best_cut,
       b.url            AS best_url,
       lo.store_id      AS low_store_id,
       lo.price_cents   AS low_price_cents,
       lo.recorded_at   AS low_recorded_at,
       COALESCE(b.price_cents <= lo.price_cents, FALSE) AS is_at_low
FROM games g
LEFT JOIN best_current b ON b.game_id = g.game_id AND b.rn = 1
LEFT JOIN lows lo ON lo.game_id = g.game_id AND lo.rn = 1;

-- Required for REFRESH ... CONCURRENTLY (reads aren't blocked during refresh).
CREATE UNIQUE INDEX game_stats_game_id_idx ON game_stats (game_id);
CREATE INDEX game_stats_best_cut_idx ON game_stats (best_cut DESC) WHERE best_cut > 0;
