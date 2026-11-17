-- The games table works like a cache: once it reaches its size cap, adding a
-- game deletes the least recently viewed one. That's safe because the data
-- source keeps the full history, so an evicted game is simply re-imported if
-- someone looks it up again.

-- When someone last opened the game's page (updated at most once a day).
ALTER TABLE games ADD COLUMN last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Protected games are never evicted: the popular games from the bulk import.
ALTER TABLE games ADD COLUMN protected BOOLEAN NOT NULL DEFAULT FALSE;

-- Everything imported so far came from the bulk import of popular games.
UPDATE games SET protected = TRUE WHERE itad_id IS NOT NULL;

-- Finds the next game to evict without scanning the table.
CREATE INDEX games_eviction_idx ON games (last_viewed_at) WHERE NOT protected;
