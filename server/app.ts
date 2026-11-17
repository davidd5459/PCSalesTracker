import { Hono, type Context } from "hono";
import { z } from "zod";
import type { ExternalGame } from "../src/types.js";
import { ConfigError, type Db, type Queryable } from "./db/client.js";
import { getGame, getHomeSections, searchGames, trackedSlugs } from "./db/queries.js";
import { recordView } from "./db/writes.js";
import { ImportRefused, importOnDemand } from "./ingest/importOnDemand.js";
import { ItadError, type ItadClient } from "./itad/client.js";
import { mapGameType } from "./itad/mapping.js";

/**
 * Cache responses at Vercel's CDN for 5 minutes (then refresh in the background),
 * but not in browsers. Browsers honor stale-while-revalidate too, so a browser
 * copy would keep showing pre-import results after a game is added; the app's
 * own query cache handles quick repeat requests instead.
 */
function cacheAtCdn(c: Context) {
  c.header("Cache-Control", "no-cache");
  c.header("CDN-Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
}

const SearchParams = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(25).default(8),
});

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,200}$/);
const ImportBody = z.object({ itadId: z.uuid() });

/** Soundtracks are sometimes typed as games at the data source; they aren't what people search for. */
const NOT_A_GAME = /\b(soundtrack|OST)\b/i;

export interface AppDeps {
  /** Database for read queries (Neon over HTTP in production). */
  getDb: () => Queryable;
  /** Runs `fn` with a database that supports transactions; needed for imports. */
  withWriteDb?: <T>(fn: (db: Db) => Promise<T>) => Promise<T>;
  /** IsThereAnyDeal client; needed for external search and imports. */
  getItad?: () => ItadClient;
}

/** The API. Takes its dependencies as arguments so tests can inject an in-memory database and a fake ITAD. */
export function createApp({ getDb, withWriteDb, getItad }: AppDeps) {
  const app = new Hono().basePath("/api");

  const requireItad = () => {
    if (!getItad) throw new ConfigError("IsThereAnyDeal is not configured");
    return getItad();
  };

  app.onError((err, c) => {
    if (err instanceof ConfigError) {
      return c.json({ error: "Service is not configured", detail: err.message }, 503);
    }
    if (err instanceof ImportRefused) return c.json({ error: err.message }, err.status);
    if (err instanceof ItadError) {
      // ITAD rejects unknown ids with a 4xx; anything else means it's having trouble.
      if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
        return c.json({ error: "That game wasn't found at IsThereAnyDeal." }, 422);
      }
      console.error(err);
      return c.json({ error: "The price data source is unavailable. Please try again later." }, 502);
    }
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/search", async (c) => {
    const parsed = SearchParams.safeParse({ q: c.req.query("q"), limit: c.req.query("limit") });
    if (!parsed.success) return c.json({ error: "Query must be 2-100 characters" }, 400);
    const results = await searchGames(getDb(), parsed.data.q, parsed.data.limit);
    cacheAtCdn(c);
    return c.json(results);
  });

  /** Games at IsThereAnyDeal that we don't track yet (candidates for importing). */
  app.get("/search/external", async (c) => {
    const parsed = SearchParams.safeParse({ q: c.req.query("q"), limit: c.req.query("limit") });
    if (!parsed.success) return c.json({ error: "Query must be 2-100 characters" }, 400);
    const found = await requireItad().search(parsed.data.q, 20);

    const candidates: ExternalGame[] = found.flatMap((g) => {
      const type = mapGameType(g.type);
      return type && !g.mature && !NOT_A_GAME.test(g.title) ? [{ itadId: g.id, slug: g.slug, title: g.title, type }] : [];
    });
    const tracked = await trackedSlugs(
      getDb(),
      candidates.map((g) => g.itadId),
    );
    const results = candidates.filter((g) => !tracked.has(g.itadId)).slice(0, parsed.data.limit);
    cacheAtCdn(c);
    return c.json(results);
  });

  /** Start tracking a game: imports its full price history, then returns its slug. */
  app.post("/games/import", async (c) => {
    const parsed = ImportBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Expected { itadId: <uuid> }" }, 400);
    if (!withWriteDb) throw new ConfigError("Imports are not configured");
    const itad = requireItad();
    const slug = await withWriteDb((db) => importOnDemand(db, itad, parsed.data.itadId));
    return c.json({ slug });
  });

  app.get("/games/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (!Slug.safeParse(slug).success) return c.json({ error: "Game not found" }, 404);
    const game = await getGame(getDb(), slug);
    if (!game) return c.json({ error: "Game not found" }, 404);
    // Keeps popular pages from being evicted. A failed write shouldn't break the page.
    // (Views served from the CDN cache don't reach here; "roughly when" is all eviction needs.)
    await recordView(getDb(), slug).catch((err) => console.error("recordView failed:", err));
    cacheAtCdn(c);
    return c.json(game);
  });

  app.get("/home", async (c) => {
    const sections = await getHomeSections(getDb());
    cacheAtCdn(c);
    return c.json(sections);
  });

  app.notFound((c) => c.json({ error: "Not found" }, 404));
  return app;
}
