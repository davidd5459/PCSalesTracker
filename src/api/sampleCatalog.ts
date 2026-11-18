/** Sample-data implementation of the catalog. The data module is loaded lazily, so it isn't bundled into the live site's main bundle. */
import { summarize } from "../lib/priceStats";
import { forecastSales } from "../lib/salePrediction";
import type { GameDetail, MajorSale, UpcomingSale } from "../types";
import type { CatalogApi } from "./catalog";

const loadGames = () => import("../data/sampleData").then((m) => m.getSampleGames());

/** Lowercase and strip punctuation so "baldurs gate" matches "Baldur's Gate". */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lower is better: exact, prefix, word prefix, substring. Null means no match. */
function matchScore(title: string, query: string): number | null {
  const t = normalizeTitle(title);
  if (t === query) return 0;
  if (t.startsWith(query)) return 1;
  if (t.split(" ").some((word) => word.startsWith(query))) return 2;
  if (t.includes(query)) return 3;
  return null;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const sampleCatalog: CatalogApi = {
  async search(query, limit = 8) {
    await delay(120);
    const q = normalizeTitle(query);
    if (!q) return [];
    return (await loadGames())
      .map((game) => ({ game, score: matchScore(game.title, q) }))
      .filter((r): r is { game: GameDetail; score: number } => r.score !== null)
      // Best match first; on ties, base games before DLC.
      .sort(
        (a, b) =>
          a.score - b.score ||
          Number(a.game.type === "dlc") - Number(b.game.type === "dlc") ||
          a.game.title.localeCompare(b.game.title),
      )
      .slice(0, limit)
      .map((r) => summarize(r.game));
  },

  async getGame(slug) {
    await delay(150);
    return (await loadGames()).find((g) => g.slug === slug) ?? null;
  },

  async searchExternal() {
    return []; // sample mode has no external data source
  },

  async importGame() {
    throw new Error("Adding games needs the live API (VITE_DATA_SOURCE=api).");
  },

  async getHomeSections() {
    await delay(150);
    const games = await loadGames();
    const summaries = games.map(summarize);
    const onSale = summaries.filter((s) => s.bestDeal && s.bestDeal.cut > 0);

    // Same rules as the API: likely, within 45 days, not on sale now.
    const now = Date.now();
    const forecasts = games.map((game) => forecastSales(game.listings, now)?.next ?? null);
    const upcomingSales: UpcomingSale[] = games
      .flatMap((_, i) => {
        const next = forecasts[i];
        const summary = summaries[i]!;
        const soon = next && next.expectedStart - now < 45 * 86_400_000 && (next.chance ?? 1) >= 0.5;
        if (!soon || (summary.bestDeal?.cut ?? 0) >= 10) return [];
        return [
          {
            game: summary,
            expectedStart: new Date(next.expectedStart).toISOString(),
            label: next.label,
            chance: next.chance,
            typicalCut: next.typicalCut,
            expectedPriceCents: next.expectedPriceCents,
          },
        ];
      })
      .sort((a, b) => a.expectedStart.localeCompare(b.expectedStart))
      .slice(0, 10);

    // The season most games' next sale falls in (within four months), as the API does.
    const seasons = new Map<string, { starts: number[]; cuts: number[] }>();
    for (const next of forecasts) {
      if (!next || next.basis !== "event" || next.expectedStart - now > 120 * 86_400_000) continue;
      const season = seasons.get(next.label) ?? { starts: [], cuts: [] };
      season.starts.push(next.expectedStart);
      if (next.typicalCut !== null) season.cuts.push(next.typicalCut);
      seasons.set(next.label, season);
    }
    const middle = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];
    const [label, top] = [...seasons].sort((a, b) => b[1].starts.length - a[1].starts.length)[0] ?? [];
    const nextMajorSale: MajorSale | null = top
      ? {
          label: label!,
          expectedStart: new Date(middle(top.starts)!).toISOString(),
          games: top.starts.length,
          typicalCut: top.cuts.length ? middle(top.cuts)! : null,
        }
      : null;

    return {
      stats: { games: games.length, onSale: summaries.filter((s) => (s.bestDeal?.cut ?? 0) >= 10).length },
      nextMajorSale,
      upcomingSales,
      biggestSales: [...onSale].sort((a, b) => b.bestDeal!.cut - a.bestDeal!.cut).slice(0, 10),
      atHistoricalLow: onSale.filter((s) => s.isAtHistoricalLow).slice(0, 10),
    };
  },
};
