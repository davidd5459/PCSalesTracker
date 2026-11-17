import { describe, expect, it } from "vitest";
import { collapseUnchanged } from "../db/writes.js";
import { mapDealUrls, mapGameInfo, mapHistory } from "../itad/mapping.js";
import type { HistoryEntry } from "../itad/schemas.js";

const shops = new Map([
  [61, "steam"],
  [35, "gog"],
]);

const usd = (cents: number) => ({ amount: cents / 100, amountInt: cents, currency: "USD" });
const entry = (timestamp: string, shopId: number, price: number | null, regular = 2999): HistoryEntry => ({
  timestamp,
  shop: { id: shopId, name: String(shopId) },
  deal: price === null ? null : { price: usd(price), regular: usd(regular), cut: Math.round((1 - price / regular) * 100) },
});

describe("mapHistory", () => {
  it("groups by store, sorts oldest first, and drops unchanged prices", () => {
    const result = mapHistory(
      [
        entry("2024-06-27T17:00:00+00:00", 61, 1499),
        entry("2024-01-01T00:00:00+00:00", 61, 2999),
        entry("2024-07-11T17:00:00+00:00", 61, 2999),
        entry("2024-07-12T17:00:00+00:00", 61, 2999), // no change: dropped
        entry("2024-03-01T00:00:00+00:00", 35, 2999),
      ],
      shops,
    );
    expect(result.get("steam")!.map((p) => p.priceCents)).toEqual([2999, 1499, 2999]);
    expect(result.get("steam")![1]).toEqual({
      timestamp: "2024-06-27T17:00:00.000Z",
      priceCents: 1499,
      regularCents: 2999,
      cut: 50,
    });
    expect(result.get("gog")).toHaveLength(1);
  });

  it("ignores untracked shops, unavailable entries and non-USD prices", () => {
    const eur = { ...entry("2024-02-01T00:00:00Z", 61, 1000), deal: { price: { ...usd(1000), currency: "EUR" }, regular: usd(2999), cut: 66 } };
    const result = mapHistory(
      [entry("2024-01-01T00:00:00Z", 61, 2999), entry("2024-01-05T00:00:00Z", 999, 100), entry("2024-01-06T00:00:00Z", 61, null), eur],
      shops,
    );
    expect(result.get("steam")).toHaveLength(1);
    expect(result.size).toBe(1);
  });
});

describe("mapGameInfo", () => {
  const base = { id: "018d937f-0000-0000-0000-000000000000", slug: "hades", title: "Hades", type: "game" };

  it("maps fields and prefers the largest banner", () => {
    const game = mapGameInfo({
      ...base,
      appid: 1145360,
      releaseDate: "2020-09-17",
      assets: { banner300: "small.jpg", banner600: "big.jpg" },
      developers: [{ name: "Supergiant Games" }],
      urls: { game: "https://isthereanydeal.com/game/hades/info/" },
    });
    expect(game).toMatchObject({ type: "game", coverUrl: "big.jpg", developer: "Supergiant Games", releaseDate: "2020-09-17", steamAppId: 1145360 });
  });

  it("skips unsupported types like bundles", () => {
    expect(mapGameInfo({ ...base, type: "package" })).toBeNull();
  });
});

describe("mapDealUrls", () => {
  it("keeps store URLs exactly as provided", () => {
    const url = "https://store.steampowered.com/app/1145360/?utm_source=itad&ref=abc";
    const urls = mapDealUrls(
      { id: "x", deals: [{ shop: { id: 61, name: "Steam" }, price: usd(999), regular: usd(2499), cut: 60, url }] },
      shops,
    );
    expect(urls.get("steam")).toBe(url);
  });
});

describe("collapseUnchanged", () => {
  it("drops points identical to the previously stored one", () => {
    const p = (priceCents: number, t: string) => ({ timestamp: t, priceCents, regularCents: 2999, cut: 0 });
    const out = collapseUnchanged([p(2999, "a"), p(1499, "b"), p(1499, "c")], { priceCents: 2999, regularCents: 2999, cut: 0 });
    expect(out.map((x) => x.timestamp)).toEqual(["b"]);
  });
});
