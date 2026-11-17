-- Precomputed sale forecasts (see src/lib/salePrediction.ts), one row per game
-- that has a likely next sale. Computing a forecast needs a game's full price
-- history, so doing it for every game on each home page request would be far
-- too slow; instead it's refreshed after imports and by the daily sync.

CREATE TABLE game_forecasts (
  game_id               INTEGER PRIMARY KEY REFERENCES games (game_id) ON DELETE CASCADE,
  next_sale_at          TIMESTAMPTZ NOT NULL,          -- expected start of the next sale
  label                 TEXT NOT NULL,                 -- e.g. 'Summer sales'
  basis                 TEXT NOT NULL CHECK (basis IN ('event', 'rhythm')),
  chance                REAL CHECK (chance BETWEEN 0 AND 1),  -- null for rhythm-based estimates
  typical_cut           SMALLINT CHECK (typical_cut BETWEEN 0 AND 100),
  expected_price_cents  INTEGER CHECK (expected_price_cents >= 0),
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX game_forecasts_next_sale_idx ON game_forecasts (next_sale_at);
