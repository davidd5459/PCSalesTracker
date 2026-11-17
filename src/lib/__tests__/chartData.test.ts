import { describe, expect, it } from "vitest";
import type { StoreListing } from "../../types";
import { buildChartRows } from "../chartData";

const listing = (storeId: string, points: [string, number, number][]): StoreListing => ({
  storeId,
  url: null,
  available: true,
  history: points.map(([timestamp, priceCents, cut]) => ({ timestamp, priceCents, regularCents: 2000, cut })),
});

const steam = listing("steam", [
  ["2024-01-01T00:00:00Z", 2000, 0],
  ["2024-03-01T00:00:00Z", 1000, 50],
  ["2024-03-08T00:00:00Z", 2000, 0],
]);
const gog = listing("gog", [
  ["2024-02-01T00:00:00Z", 1800, 10],
  ["2024-03-01T00:00:00Z", 1500, 25],
]);
const NOW = Date.parse("2024-04-01T00:00:00Z");

describe("buildChartRows", () => {
  it("carries each store's last price forward on a shared timeline", () => {
    const rows = buildChartRows([steam, gog], null, NOW);
    expect(rows.map((r) => [new Date(r.t).toISOString().slice(0, 10), r.steam, r.gog])).toEqual([
      ["2024-01-01", 2000, undefined], // GOG not listed yet
      ["2024-02-01", 2000, 1800],
      ["2024-03-01", 1000, 1500], // simultaneous changes merge into one row
      ["2024-03-08", 2000, 1500],
      ["2024-04-01", 2000, 1500], // extended to "now"
    ]);
    expect(rows[2]!["steam:cut"]).toBe(50);
  });

  it("starts a range with the prices in effect at that moment", () => {
    const start = Date.parse("2024-02-15T00:00:00Z");
    const rows = buildChartRows([steam, gog], start, NOW);
    expect(rows[0]).toMatchObject({ t: start, steam: 2000, gog: 1800 });
    expect(rows).toHaveLength(4);
  });

  it("ends a delisted store's line at its last recorded price", () => {
    const rows = buildChartRows([steam, { ...gog, available: false }], null, NOW);
    expect(rows.find((r) => r.t === Date.parse("2024-03-01T00:00:00Z"))!.gog).toBe(1500);
    expect(rows.at(-1)!.gog).toBeUndefined();
    expect(rows.at(-1)!.steam).toBe(2000);
  });

  it("returns no rows when there is no history", () => {
    expect(buildChartRows([], null, NOW)).toEqual([]);
  });
});
