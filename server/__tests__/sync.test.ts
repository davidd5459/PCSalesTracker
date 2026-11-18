import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STORES } from "../../src/config/stores.js";
import type { GameDetail } from "../../src/types.js";
import type { Db } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { getGame } from "../db/queries.js";
import { upsertStores } from "../db/writes.js";
import { importGame } from "../ingest/importGame.js";
import { syncPrices } from "../ingest/sync.js";
import type { ItadClient } from "../itad/client.js";
import type { HistoryEntry } from "../itad/schemas.js";
import { createTestDb } from "../test/pgliteDb.js";

const GAME = "018d937f-cccc-7000-8000-000000000001";
const STEAM = 61;
const GOG = 35;
const usd = (cents: number) => ({ amount: cents / 100, amountInt: cents, currency: "USD" });
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/** A fake data source whose prices the tests change between syncs. */
const source = {
  history: [] as HistoryEntry[],
  /** Current price per shop id (in cents); a missing shop means it no longer sells the game. */
  current: new Map<number, number>(),
  calls: [] as string[],
};

const entry = (timestamp: string, shop: number, cents: number): HistoryEntry => ({
  timestamp,
  shop: { id: shop, name: String(shop) },
  deal: { price: usd(cents), regular: usd(2000), cut: Math.round((1 - cents / 2000) * 100) },
});

const fakeItad = {
  async info(id: string) {
    return { id, slug: "sync-game", title: "Sync Game", type: "game", assets: {}, urls: {} };
  },
  async history(_id: string, opts: { since?: string }) {
    source.calls.push("history");
    const since = opts.since ? Date.parse(opts.since) : 0;
    return source.history.filter((e) => Date.parse(e.timestamp) >= since);
  },
  async prices(ids: string[]) {
    source.calls.push("prices");
    return ids.map((id) => ({
      id,
      deals: [...source.current].map(([shop, cents]) => ({
        shop: { id: shop, name: String(shop) },
        price: usd(cents),
        regular: usd(2000),
        cut: Math.round((1 - cents / 2000) * 100),
        url: `https://store.example/${shop}/${cents}`,
      })),
    }));
  },
} as unknown as ItadClient;

let db: Db;
const sync = () => syncPrices(db, fakeItad, () => {});
const game = async () => (await getGame(db, "sync-game")) as GameDetail;
const listing = async (storeId: string) => (await game()).listings.find((l) => l.storeId === storeId)!;

beforeAll(async () => {
  db = await createTestDb();
  await runMigrations(db);
  await upsertStores(
    db,
    STORES.map((s, i) => ({ storeId: s.id, name: s.name, itadShopId: s.itad?.shopId ?? null, sortOrder: i })),
  );
  source.history = [entry("2023-01-10T17:00:00Z", STEAM, 2000), entry("2023-01-10T17:00:00Z", GOG, 2000)];
  source.current = new Map([
    [STEAM, 2000],
    [GOG, 2000],
  ]);
  const stores = new Map([
    [STEAM, "steam"],
    [GOG, "gog"],
  ]);
  await importGame(db, fakeItad, stores, GAME);
}, 60_000);

afterAll(() => db?.close());

describe("daily price sync", () => {
  it("skips games whose prices haven't changed (no history request)", async () => {
    source.calls = [];
    const r = await sync();
    expect(r).toMatchObject({ checked: 1, changed: 0, points: 0, failed: 0 });
    expect(source.calls).toEqual(["prices"]);
  });

  it("records a new sale with the time the store started it", async () => {
    const started = hoursAgo(5);
    source.history.push(entry(started, STEAM, 1000));
    source.current.set(STEAM, 1000);

    const r = await sync();
    expect(r).toMatchObject({ changed: 1, points: 1 });
    const steam = await listing("steam");
    expect(steam.history.at(-1)).toMatchObject({ priceCents: 1000, cut: 50, timestamp: started.slice(0, 19) + "Z" });
    expect(steam.url).toBe("https://store.example/61/1000");

    // Running again changes nothing.
    expect((await sync()).points).toBe(0);
  });

  it("marks a store that stops selling the game as no longer selling it", async () => {
    source.current.delete(GOG);
    const r = await sync();
    expect(r.changed).toBe(1);
    expect((await listing("gog")).available).toBe(false);
    expect((await listing("steam")).available).toBe(true);
  });

  it("brings a store back when it starts selling the game again", async () => {
    source.current.set(GOG, 2000);
    await sync();
    expect((await listing("gog")).available).toBe(true);
  });
});
