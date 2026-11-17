import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSampleGames } from "../../src/data/sampleData.js";
import { summarize } from "../../src/lib/priceStats.js";
import type { GameDetail, GameSummary, HomeSections } from "../../src/types.js";
import { createApp } from "../app.js";
import type { Db } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { importSampleGames } from "../ingest/importSample.js";
import { createTestDb } from "../test/pgliteDb.js";

let db: Db;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  db = await createTestDb();
  await runMigrations(db);
  await importSampleGames(db);
  app = createApp(() => db);
}, 60_000);

afterAll(() => db?.close());

async function get<T>(path: string): Promise<{ status: number; body: T }> {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as T };
}

describe("migrations", () => {
  it("are idempotent", async () => {
    expect(await runMigrations(db)).toEqual([]);
  });
});

describe("GET /api/games/:slug", () => {
  it("returns full history grouped by store", async () => {
    const { status, body } = await get<GameDetail>("/api/games/the-witcher-3-wild-hunt");
    expect(status).toBe(200);
    expect(body.title).toBe("The Witcher 3: Wild Hunt");
    expect(body.listings.map((l) => l.storeId)).toEqual(["steam", "gog", "epic", "humble", "fanatical", "gmg"]);
    for (const listing of body.listings) {
      const times = listing.history.map((p) => Date.parse(p.timestamp));
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(listing.history[0]!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    }
  });

  it("links DLC to its base game", async () => {
    const { body } = await get<GameDetail>("/api/games/cyberpunk-2077-phantom-liberty");
    expect(body.baseGame).toEqual({ slug: "cyberpunk-2077", title: "Cyberpunk 2077" });
  });

  it("404s for unknown or malformed slugs", async () => {
    expect((await get("/api/games/does-not-exist")).status).toBe(404);
    expect((await get("/api/games/DROP%20TABLE")).status).toBe(404);
  });
});

describe("SQL summaries match the frontend's TypeScript logic", () => {
  it("agrees on best deal and all-time low for every game", async () => {
    for (const game of getSampleGames()) {
      const expected = summarize(game);
      const { body } = await get<GameSummary[]>(`/api/search?q=${encodeURIComponent(game.title)}&limit=25`);
      const actual = body.find((s) => s.slug === game.slug);
      expect(actual, game.slug).toBeDefined();
      expect(actual!.bestDeal?.priceCents, `${game.slug} best price`).toBe(expected.bestDeal?.priceCents);
      expect(actual!.bestDeal?.storeId, `${game.slug} best store`).toBe(expected.bestDeal?.storeId);
      expect(actual!.historicalLow?.priceCents, `${game.slug} low`).toBe(expected.historicalLow?.priceCents);
      // The API reports timestamps to the second; sample "now" timestamps carry milliseconds.
      const toSecond = (iso: string) => Math.floor(Date.parse(iso) / 1000);
      expect(toSecond(actual!.historicalLow!.timestamp), `${game.slug} low date`).toBe(
        toSecond(expected.historicalLow!.timestamp),
      );
      expect(actual!.isAtHistoricalLow, `${game.slug} at low`).toBe(expected.isAtHistoricalLow);
    }
  });
});

describe("GET /api/search", () => {
  it("ranks base games before DLC", async () => {
    const { body } = await get<GameSummary[]>("/api/search?q=witcher");
    expect(body.map((g) => g.slug)).toEqual(["the-witcher-3-wild-hunt", "the-witcher-3-blood-and-wine"]);
  });

  it("finds fuzzy matches", async () => {
    const { body } = await get<GameSummary[]>("/api/search?q=hollow%20knigt");
    expect(body[0]?.slug).toBe("hollow-knight");
  });

  it("treats LIKE wildcards literally", async () => {
    const { body } = await get<GameSummary[]>("/api/search?q=%25%25");
    expect(body).toEqual([]);
  });

  it("rejects too-short queries", async () => {
    expect((await get("/api/search?q=a")).status).toBe(400);
  });
});

describe("GET /api/home", () => {
  it("returns populated sections", async () => {
    const { status, body } = await get<HomeSections>("/api/home");
    expect(status).toBe(200);
    expect(body.stats.games).toBe(getSampleGames().length);
    expect(body.biggestSales.length).toBeGreaterThan(0);
    const cuts = body.biggestSales.map((g) => g.bestDeal!.cut);
    expect(cuts).toEqual([...cuts].sort((a, b) => b - a));
    expect(body.atHistoricalLow.every((g) => g.isAtHistoricalLow)).toBe(true);
    expect(body.latestChanges.every((c) => c.priceCents !== c.previousCents)).toBe(true);
  });
});

describe("re-importing", () => {
  it("adds no duplicate price points", async () => {
    const count = async () => (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM price_points"))[0]!.n;
    const before = await count();
    await importSampleGames(db);
    expect(await count()).toBe(before);
  });
});
