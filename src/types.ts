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

export interface HomeSections {
  stats: { games: number; stores: number; priceChanges: number };
  biggestSales: GameSummary[];
  atHistoricalLow: GameSummary[];
  latestChanges: PriceChange[];
  newReleases: GameSummary[];
}
