/** Sample-data implementation of the catalog. The data module is loaded lazily, so it isn't bundled into the live site's main bundle. */
import { summarize } from "../lib/priceStats";
import { forecastSales } from "../lib/salePrediction";
import type { GameDetail, PriceChange, UpcomingSale } from "../types";
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

    const changes: PriceChange[] = games.flatMap((game) =>
      game.listings.flatMap((listing) =>
        listing.history.slice(1).map((point, i) => ({
          game: { slug: game.slug, title: game.title, type: game.type, coverUrl: game.coverUrl },
          storeId: listing.storeId,
          timestamp: point.timestamp,
          priceCents: point.priceCents,
          regularCents: point.regularCents,
          cut: point.cut,
          previousCents: listing.history[i]!.priceCents,
        })),
      ),
    );

    // Same rules as the API's "Sales expected soon": likely, within 45 days, not on sale now.
    const now = Date.now();
    const upcomingSales: UpcomingSale[] = games
      .flatMap((game, i) => {
        const next = forecastSales(game.listings, now)?.next;
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

    return {
      upcomingSales,
      stats: {
        games: games.length,
        stores: new Set(games.flatMap((g) => g.listings.map((l) => l.storeId))).size,
        priceChanges: games.reduce((n, g) => n + g.listings.reduce((m, l) => m + l.history.length, 0), 0),
      },
      biggestSales: [...onSale].sort((a, b) => b.bestDeal!.cut - a.bestDeal!.cut).slice(0, 10),
      atHistoricalLow: onSale.filter((s) => s.isAtHistoricalLow).slice(0, 10),
      latestChanges: changes.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, 10),
      newReleases: [...summaries]
        .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""))
        .slice(0, 10),
    };
  },
};
