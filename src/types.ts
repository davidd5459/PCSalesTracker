/** Core domain types shared across the app. Prices are always integer cents (USD). */

export type GameType = "game" | "dlc";

/** One recorded price change at a store. The price holds until the next point. */
export interface PricePoint {
  /** ISO 8601 timestamp of when this price took effect. */
  timestamp: string;
  priceCents: number;
  regularCents: number;
  /** Discount percentage, 0 when not on sale. */
  cut: number;
}

/** A game's presence at one store, with its full price history (oldest first). */
export interface StoreListing {
  storeId: string;
  url: string | null;
  /** False when the store no longer sells the game; its history is kept but it has no current price. */
  available: boolean;
  history: PricePoint[];
}

/** The current price at one store. */
export interface Deal {
  storeId: string;
  priceCents: number;
  regularCents: number;
  cut: number;
  url: string | null;
}

/** The lowest price ever recorded across all stores. */
export interface HistoricalLow {
  storeId: string;
  priceCents: number;
  /** Most recent time this price was seen. */
  timestamp: string;
}

/** Lightweight shape used by search results and cards. */
export interface GameSummary {
  slug: string;
  title: string;
  type: GameType;
  coverUrl: string | null;
  releaseDate: string | null;
  bestDeal: Deal | null;
  historicalLow: HistoricalLow | null;
  /** True when the best current price matches or beats the historical low. */
  isAtHistoricalLow: boolean;
}

/** Full detail for the game page. */
export interface GameDetail {
  slug: string;
  title: string;
  type: GameType;
  coverUrl: string | null;
  developer: string | null;
  releaseDate: string | null;
  /** For DLC: the base game it belongs to. */
  baseGame: { slug: string; title: string } | null;
  /** This game's page at the data source (IsThereAnyDeal), for attribution. */
  sourceUrl: string | null;
  listings: StoreListing[];
}

/** A single price change at one store, used by the home page feed. */
export interface PriceChange {
  game: Pick<GameSummary, "slug" | "title" | "type" | "coverUrl">;
  storeId: string;
  timestamp: string;
  priceCents: number;
  regularCents: number;
  cut: number;
  previousCents: number;
}

/** A game we expect to go on sale soon (from the sale forecast). */
export interface UpcomingSale {
  game: GameSummary;
  /** Expected start of the sale (ISO 8601). */
  expectedStart: string;
  /** What the forecast is based on, e.g. "Summer sales". */
  label: string;
  /** 0–1, or null when estimated from the game's general sale rhythm. */
  chance: number | null;
  typicalCut: number | null;
  expectedPriceCents: number | null;
}

/** A game found at the data source that we don't track yet. */
export interface ExternalGame {
  itadId: string;
  slug: string;
  title: string;
  type: GameType;
}

export interface HomeSections {
  stats: { games: number; stores: number; priceChanges: number };
  upcomingSales: UpcomingSale[];
  biggestSales: GameSummary[];
  atHistoricalLow: GameSummary[];
  latestChanges: PriceChange[];
  newReleases: GameSummary[];
}
