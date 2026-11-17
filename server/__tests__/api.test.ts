import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSampleGames } from "../../src/data/sampleData.js";
import { summarize } from "../../src/lib/priceStats.js";
import type { ExternalGame, GameDetail, GameSummary, HomeSections } from "../../src/types.js";
import { createApp } from "../app.js";
import type { Db } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { linkDlcToBaseGames, upsertGame } from "../db/writes.js";
import { importOnDemand } from "../ingest/importOnDemand.js";
import { importSampleGames } from "../ingest/importSample.js";
import type { ItadClient } from "../itad/client.js";
import { createTestDb } from "../test/pgliteDb.js";

let db: Db;
let app: ReturnType<typeof createApp>;

// --- a fake IsThereAnyDeal, so tests run offline ---------------------------------

const NEW_ID = "018d937f-aaaa-7000-8000-000000000001";
const BUNDLE_ID = "018d937f-aaaa-7000-8000-000000000002";
const usd = (cents: number) => ({ amount: cents / 100, amountInt: cents, currency: "USD" });
const itadCalls: string[] = [];

const fakeItad = {
  async search() {
    itadCalls.push("search");
    return [
      { id: NEW_ID, slug: "brand-new-game", title: "Brand New Game", type: null },
      { id: BUNDLE_ID, slug: "brand-new-bundle", title: "Brand New Bundle", type: "package" },
      { id: "018d937f-aaaa-7000-8000-000000000003", slug: "adult-game", title: "Adult Game", type: "game", mature: true },
      { id: "018d937f-aaaa-7000-8000-000000000004", slug: "brand-new-game-ost", title: "Brand New Game Original Soundtrack", type: "game" },
      { id: "018d937f-aaaa-7000-8000-000000000005", slug: "ghost-of-brand-new", title: "Ghost of Brand New", type: "game" },
    ];
  },
  async info(id: string) {
    itadCalls.push("info");
    const bundle = id === BUNDLE_ID;
    // Every other id is its own game, e.g. "...00a1" → "extra-game-00a1".
    const suffix = id.slice(-4);
    return {
      id,
      slug: bundle ? "brand-new-bundle" : id === NEW_ID ? "brand-new-game" : `extra-game-${suffix}`,
      title: bundle ? "Brand New Bundle" : id === NEW_ID ? "Brand New Game" : `Extra Game ${suffix}`,
      type: bundle ? "package" : null,
      appid: 123,
      releaseDate: "2023-01-10",
      assets: {},
      developers: [{ name: "Test Studio" }],
      urls: { game: "https://isthereanydeal.com/game/brand-new-game/info/" },
    };
  },
  async history() {
    itadCalls.push("history");
    const deal = (cents: number, cut: number) => ({ price: usd(cents), regular: usd(2000), cut });
    return [
      { timestamp: "2023-01-10T17:00:00+00:00", shop: { id: 61, name: "Steam" }, deal: deal(2000, 0) },
      { timestamp: "2023-06-29T17:00:00+00:00", shop: { id: 61, name: "Steam" }, deal: deal(1000, 50) },
      { timestamp: "2023-07-13T17:00:00+00:00", shop: { id: 61, name: "Steam" }, deal: deal(2000, 0) },
    ];
  },
  async prices(ids: string[]) {
    itadCalls.push("prices");
    const url = "https://store.steampowered.com/app/123/";
    return ids.map((id) => ({
      id,
      deals: [{ shop: { id: 61, name: "Steam" }, price: usd(2000), regular: usd(2000), cut: 0, url }],
    }));
  },
} as unknown as ItadClient;

beforeAll(async () => {
  db = await createTestDb();
  await runMigrations(db);
  await importSampleGames(db);
  app = createApp({ getDb: () => db, withWriteDb: (fn) => fn(db), getItad: () => fakeItad });
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

describe("sales expected soon", () => {
  it("lists likely upcoming sales for games that aren't already on sale", async () => {
    const { body } = await get<HomeSections>("/api/home");
    const now = Date.now();
    expect(body.upcomingSales.length).toBeGreaterThan(0);
    for (const s of body.upcomingSales) {
      const t = Date.parse(s.expectedStart);
      expect(t).toBeGreaterThan(now);
      expect(t - now).toBeLessThan(45 * 86_400_000);
      expect(s.chance === null || s.chance >= 0.5).toBe(true);
      expect(s.game.bestDeal?.cut ?? 0).toBeLessThan(10);
    }
    const times = body.upcomingSales.map((s) => s.expectedStart.slice(0, 10));
    expect(times).toEqual([...times].sort());
  });
});

describe("adding untracked games", () => {
  const post = (body: unknown) =>
    app.request("/api/games/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("searches the data source, skipping bundles, mature titles and tracked games", async () => {
    const { status, body } = await get<ExternalGame[]>("/api/search/external?q=brand%20new");
    expect(status).toBe(200);
    expect(body.map((g) => g.title)).toEqual(["Brand New Game", "Ghost of Brand New"]); // "Ghost" isn't "OST"
    expect(body[0]).toEqual({ itadId: NEW_ID, slug: "brand-new-game", title: "Brand New Game", type: "game" });
  });

  it("imports a game with its history, then serves it", async () => {
    const res = await post({ itadId: NEW_ID });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ slug: "brand-new-game" });

    const { status, body } = await get<GameDetail>("/api/games/brand-new-game");
    expect(status).toBe(200);
    expect(body.type).toBe("game"); // untyped at ITAD counts as a game
    expect(body.listings[0]).toMatchObject({ storeId: "steam", available: true, url: "https://store.steampowered.com/app/123/" });
    expect(body.listings[0]!.history.map((p) => p.cut)).toEqual([0, 50, 0]);

    // Now tracked: no longer offered as an external result, and found by normal search.
    const stillExternal = (await get<ExternalGame[]>("/api/search/external?q=brand%20new")).body;
    expect(stillExternal.map((g) => g.slug)).not.toContain("brand-new-game");
    expect((await get<GameSummary[]>("/api/search?q=brand%20new")).body[0]?.slug).toBe("brand-new-game");
  });

  it("doesn't re-import a game that's already tracked", async () => {
    itadCalls.length = 0;
    const res = await post({ itadId: NEW_ID });
    expect(await res.json()).toEqual({ slug: "brand-new-game" });
    expect(itadCalls).toEqual([]);
  });

  it("refuses bundles, bad input, and imports past the hourly limit", async () => {
    const bundle = await post({ itadId: BUNDLE_ID });
    expect(bundle.status).toBe(422);
    expect((await post({ itadId: "not-a-uuid" })).status).toBe(400);
    expect((await post(null)).status).toBe(400);

    const other = "018d937f-aaaa-7000-8000-0000000000ff";
    await expect(importOnDemand(db, fakeItad, other, { perHour: 0, maxGames: 99_999 })).rejects.toMatchObject({
      status: 429,
    });
  });
});

describe("linking DLC to base games", () => {
  it("matches by title prefix and prefers the longest base title", async () => {
    const add = (slug: string, title: string, type: "game" | "dlc") =>
      upsertGame(db, { itadId: null, slug, title, type, steamAppId: null, coverUrl: null, developer: null, releaseDate: null, isMature: false, sourceUrl: null });
    await add("dark-souls", "Dark Souls", "game");
    await add("dark-souls-iii", "Dark Souls III", "game");
    await add("ds3-ringed-city", "Dark Souls III - The Ringed City", "dlc");
    await add("darkness-dlc", "Dark Soulsy Thing: Extra", "dlc"); // no real match
    expect(await linkDlcToBaseGames(db)).toBe(1);
    expect((await get<GameDetail>("/api/games/ds3-ringed-city")).body.baseGame?.slug).toBe("dark-souls-iii");
    expect((await get<GameDetail>("/api/games/darkness-dlc")).body.baseGame).toBeNull();
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

// Runs last: it deletes games that earlier tests rely on.
describe("replacing the least recently viewed game when full", () => {
  const id = (n: string) => `018d937f-bbbb-7000-8000-00000000${n}`;
  const total = async () => (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM games"))[0]!.n;
  const exists = async (slug: string) => (await get(`/api/games/${slug}`)).status === 200;
  const ageView = (slug: string, days: number) =>
    db.query(`UPDATE games SET protected = FALSE, last_viewed_at = now() - make_interval(days => $2) WHERE slug = $1`, [
      slug,
      days,
    ]);

  it("evicts the unprotected game nobody has viewed for longest", async () => {
    await db.query("UPDATE games SET protected = TRUE");
    await ageView("celeste", 30);
    await ageView("terraria", 2);
    const before = await total();

    const slug = await importOnDemand(db, fakeItad, id("00a1"), { perHour: 99, maxGames: before });
    expect(slug).toBe("extra-game-00a1");
    expect(await total()).toBe(before); // one in, one out
    expect(await exists("celeste")).toBe(false);
    expect(await exists("terraria")).toBe(true);
    expect(await exists("extra-game-00a1")).toBe(true);
  });

  it("counts a page view as recent use", async () => {
    // Terraria was last viewed 2 days ago, but the GET in the previous test refreshed that.
    // The newly added game was viewed an hour ago, so it's now the least recently viewed.
    await db.query("UPDATE games SET last_viewed_at = now() - interval '1 hour' WHERE slug = 'extra-game-00a1'");
    const before = await total();
    await importOnDemand(db, fakeItad, id("00a2"), { perHour: 99, maxGames: before });
    expect(await exists("terraria")).toBe(true);
    expect(await exists("extra-game-00a1")).toBe(false);
  });

  it("never evicts protected games, and refuses when every game is protected", async () => {
    await db.query("UPDATE games SET protected = TRUE");
    const before = await total();
    await expect(importOnDemand(db, fakeItad, id("00a3"), { perHour: 99, maxGames: before })).rejects.toMatchObject({
      status: 503,
    });
    expect(await total()).toBe(before);
  });

  it("doesn't evict anything when the import itself fails", async () => {
    await ageView("terraria", 5);
    const before = await total();
    await expect(importOnDemand(db, fakeItad, BUNDLE_ID, { perHour: 99, maxGames: before })).rejects.toMatchObject({
      status: 422,
    });
    expect(await exists("terraria")).toBe(true);
    expect(await total()).toBe(before);
  });
});
