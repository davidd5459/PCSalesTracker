import { describe, expect, it } from "vitest";
import type { PricePoint, StoreListing } from "../../types";
import { forecastSales, saleCalendar, saleEpisodes } from "../salePrediction";

const REGULAR = 4000;
const point = (date: string, cut: number): PricePoint => ({
  timestamp: `${date}T17:00:00Z`,
  priceCents: Math.round((REGULAR * (100 - cut)) / 100),
  regularCents: REGULAR,
  cut,
});
const listing = (storeId: string, points: PricePoint[], available = true): StoreListing => ({
  storeId,
  url: null,
  available,
  history: points,
});

/** A game that joins every Steam Summer Sale (late June, 50% off) and nothing else. */
function summerOnly(years: number[]): PricePoint[] {
  const pts = [point(`${years[0]! - 1}-01-01`, 0)];
  for (const y of years) pts.push(point(`${y}-06-26`, 50), point(`${y}-07-10`, 0));
  return pts;
}

describe("saleEpisodes", () => {
  it("finds discounted stretches and ignores tiny cuts", () => {
    const eps = saleEpisodes([
      listing("steam", [point("2024-01-01", 0), point("2024-02-01", 5), point("2024-03-01", 30), point("2024-03-05", 40), point("2024-03-10", 0)]),
    ]);
    expect(eps).toHaveLength(1);
    expect(eps[0]).toMatchObject({ cut: 40, start: Date.parse("2024-03-01T17:00:00Z"), end: Date.parse("2024-03-10T17:00:00Z") });
  });
});

describe("forecastSales", () => {
  const now = Date.parse("2026-05-20T00:00:00Z");

  it("predicts a game's regular summer sale", () => {
    const f = forecastSales([listing("steam", summerOnly([2021, 2022, 2023, 2024, 2025]))], now)!;
    const summer = f.events.find((e) => e.event.id === "summer")!;
    expect(summer.hits).toBe(4);
    expect(summer.chance).toBeGreaterThan(0.85);
    expect(summer.typicalCut).toBe(50);
    expect(summer.expectedPriceCents).toBe(2000);
    expect(new Date(summer.expectedStart).toISOString().slice(0, 10)).toBe("2026-06-26");
    expect(f.next).toMatchObject({ basis: "event", label: "Summer sales", typicalCut: 50 });
    // Not on sale, sale about five weeks out: wait.
    expect(f.verdict.kind).toBe("wait");
  });

  it("does not expect events the game never joins", () => {
    const f = forecastSales([listing("steam", summerOnly([2021, 2022, 2023, 2024, 2025]))], now)!;
    const winter = f.events.find((e) => e.event.id === "winter")!;
    expect(winter.hits).toBe(0);
    expect(winter.chance).toBeLessThan(0.2);
  });

  it("says buy when the current price is the all-time low", () => {
    const pts = [...summerOnly([2022, 2023, 2024, 2025]), point("2026-05-15", 75)];
    expect(forecastSales([listing("steam", pts)], now)!.verdict.kind).toBe("buy");
  });

  it("says wait when a much deeper sale is coming soon", () => {
    const pts = [...summerOnly([2022, 2023, 2024, 2025]), point("2026-05-15", 20)];
    const f = forecastSales([listing("steam", pts)], now)!;
    expect(f.onSaleNow).toBe(true);
    expect(f.verdict.kind).toBe("wait");
  });

  it("admits when there isn't enough history", () => {
    const f = forecastSales([listing("steam", [point("2026-01-01", 0)])], now)!;
    expect(f.verdict.kind).toBe("unknown");
    expect(f.next).toBeNull();
  });

  it("returns nothing for free games", () => {
    const free = { timestamp: "2024-01-01T00:00:00Z", priceCents: 0, regularCents: 0, cut: 0 };
    expect(forecastSales([listing("steam", [free])], now)).toBeNull();
  });
});

describe("saleCalendar", () => {
  it("marks the deepest discount per month and untracked months", () => {
    const cal = saleCalendar([listing("steam", [point("2025-03-01", 0), point("2025-06-26", 50), point("2025-07-10", 0)])], Date.parse("2025-12-31T00:00:00Z"));
    expect(cal).toHaveLength(1);
    const months = cal[0]!.months;
    expect(months[0]).toBeNull(); // before tracking started
    expect(months[2]).toBe(0);
    expect(months[5]).toBe(50);
    expect(months[6]).toBe(50); // sale ran into July
    expect(months[7]).toBe(0);
  });
});
