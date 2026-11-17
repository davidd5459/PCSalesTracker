import { Hono } from "hono";
import { z } from "zod";
import { ConfigError, type Queryable } from "./db/client.js";
import { getGame, getHomeSections, searchGames } from "./db/queries.js";

/** CDN caching: serve from Vercel's edge for 5 min, then refresh in the background. */
const CACHE_PUBLIC = "public, s-maxage=300, stale-while-revalidate=3600";

const SearchParams = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(25).default(8),
});

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,200}$/);

/** The API. Takes a db factory so tests can inject an in-memory database. */
export function createApp(getDb: () => Queryable) {
  const app = new Hono().basePath("/api");

  app.onError((err, c) => {
    if (err instanceof ConfigError) {
      return c.json({ error: "Service is not configured", detail: err.message }, 503);
    }
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/search", async (c) => {
    const parsed = SearchParams.safeParse({ q: c.req.query("q"), limit: c.req.query("limit") });
    if (!parsed.success) return c.json({ error: "Query must be 2-100 characters" }, 400);
    const results = await searchGames(getDb(), parsed.data.q, parsed.data.limit);
    c.header("Cache-Control", CACHE_PUBLIC);
    return c.json(results);
  });

  app.get("/games/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (!Slug.safeParse(slug).success) return c.json({ error: "Game not found" }, 404);
    const game = await getGame(getDb(), slug);
    if (!game) return c.json({ error: "Game not found" }, 404);
    c.header("Cache-Control", CACHE_PUBLIC);
    return c.json(game);
  });

  app.get("/home", async (c) => {
    const sections = await getHomeSections(getDb());
    c.header("Cache-Control", CACHE_PUBLIC);
    return c.json(sections);
  });

  app.notFound((c) => c.json({ error: "Not found" }, 404));
  return app;
}
