-- Track whether a store still sells a game. Price history sources keep a store's
-- old prices after it stops selling a game, so without this flag a store that
-- delisted a game years ago would still show its last price as "current".

ALTER TABLE listings ADD COLUMN available BOOLEAN NOT NULL DEFAULT TRUE;

-- Rebuild game_stats so the best current deal only considers stores that still sell the game.
-- The all-time low still includes every store, since those prices were real.
DROP MATERIALIZED VIEW game_stats;

CREATE MATERIALIZED VIEW game_stats AS
WITH latest AS (
  -- Current price at each listing that is still for sale = its most recent price point.
  SELECT DISTINCT ON (p.listing_id)
         l.game_id, l.store_id, l.url, p.price_cents, p.regular_cents, p.cut
  FROM price_points p
  JOIN listings l USING (listing_id)
  WHERE l.available
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

CREATE UNIQUE INDEX game_stats_game_id_idx ON game_stats (game_id);
CREATE INDEX game_stats_best_cut_idx ON game_stats (best_cut DESC) WHERE best_cut > 0;
