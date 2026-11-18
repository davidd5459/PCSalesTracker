/**
 * SAMPLE DATA for UI development only. Prices are generated, not real.
 *
 * Histories are generated deterministically (seeded per game + store) so the
 * charts look the same on every reload. They model real storefront behavior:
 * seasonal sales, occasional publisher sales, discounts that deepen as a game
 * ages, and occasional permanent price cuts. Replaced by real data in chunk 2.
 */
import type { GameDetail, GameType, PricePoint, StoreListing } from "../types.js";

interface SampleGameSpec {
  slug: string;
  title: string;
  type: GameType;
  steamAppId: number;
  developer: string;
  releaseDate: string;
  priceCents: number;
  stores: string[];
  /** Cap on how deep sales go (some games rarely discount heavily). */
  maxCut?: number;
  baseGameSlug?: string;
  /** Put the game on sale right now. Omit `cut` to match its all-time low. */
  saleNow?: { store: string; cut?: number };
  /** A store that stopped selling the game on this date. */
  delisted?: { store: string; on: string };
}

const SPECS: SampleGameSpec[] = [
  { slug: "cyberpunk-2077", title: "Cyberpunk 2077", type: "game", steamAppId: 1091500, developer: "CD PROJEKT RED", releaseDate: "2020-12-10", priceCents: 5999, stores: ["steam", "gog", "epic", "gmg"], saleNow: { store: "gog", cut: 60 } },
  { slug: "cyberpunk-2077-phantom-liberty", title: "Cyberpunk 2077: Phantom Liberty", type: "dlc", steamAppId: 2138330, developer: "CD PROJEKT RED", releaseDate: "2023-09-26", priceCents: 2999, stores: ["steam", "gog", "epic"], baseGameSlug: "cyberpunk-2077", saleNow: { store: "epic", cut: 30 } },
  { slug: "the-witcher-3-wild-hunt", title: "The Witcher 3: Wild Hunt", type: "game", steamAppId: 292030, developer: "CD PROJEKT RED", releaseDate: "2015-05-18", priceCents: 3999, stores: ["steam", "gog", "epic", "humble", "fanatical", "gmg"], delisted: { store: "fanatical", on: "2021-04-01" } },
  { slug: "the-witcher-3-blood-and-wine", title: "The Witcher 3: Wild Hunt – Blood and Wine", type: "dlc", steamAppId: 378648, developer: "CD PROJEKT RED", releaseDate: "2016-05-31", priceCents: 1999, stores: ["steam", "gog"], baseGameSlug: "the-witcher-3-wild-hunt" },
  { slug: "hades", title: "Hades", type: "game", steamAppId: 1145360, developer: "Supergiant Games", releaseDate: "2020-09-17", priceCents: 2499, stores: ["steam", "epic", "humble", "fanatical", "gmg"], saleNow: { store: "humble" } },
  { slug: "hades-ii", title: "Hades II", type: "game", steamAppId: 1145350, developer: "Supergiant Games", releaseDate: "2025-09-25", priceCents: 2999, stores: ["steam", "epic"], saleNow: { store: "steam", cut: 15 } },
  { slug: "stardew-valley", title: "Stardew Valley", type: "game", steamAppId: 413150, developer: "ConcernedApe", releaseDate: "2016-02-26", priceCents: 1499, stores: ["steam", "gog", "humble", "gmg"], maxCut: 30 },
  { slug: "hollow-knight", title: "Hollow Knight", type: "game", steamAppId: 367520, developer: "Team Cherry", releaseDate: "2017-02-24", priceCents: 1499, stores: ["steam", "gog", "humble", "fanatical", "gmg"], maxCut: 50, saleNow: { store: "gog" } },
  { slug: "red-dead-redemption-2", title: "Red Dead Redemption 2", type: "game", steamAppId: 1174180, developer: "Rockstar Games", releaseDate: "2019-12-05", priceCents: 5999, stores: ["steam", "epic", "humble", "fanatical", "gmg"], saleNow: { store: "gmg" } },
  { slug: "elden-ring", title: "Elden Ring", type: "game", steamAppId: 1245620, developer: "FromSoftware", releaseDate: "2022-02-25", priceCents: 5999, stores: ["steam", "humble", "fanatical", "gmg"], maxCut: 40, saleNow: { store: "fanatical", cut: 35 } },
  { slug: "baldurs-gate-3", title: "Baldur's Gate 3", type: "game", steamAppId: 1086940, developer: "Larian Studios", releaseDate: "2023-08-03", priceCents: 5999, stores: ["steam", "gog"], maxCut: 25 },
  { slug: "celeste", title: "Celeste", type: "game", steamAppId: 504230, developer: "Maddy Makes Games", releaseDate: "2018-01-25", priceCents: 1999, stores: ["steam", "epic", "humble", "gmg"] },
  { slug: "terraria", title: "Terraria", type: "game", steamAppId: 105600, developer: "Re-Logic", releaseDate: "2011-05-16", priceCents: 999, stores: ["steam", "gog", "humble", "gmg"], maxCut: 50, saleNow: { store: "steam", cut: 50 } },
  { slug: "disco-elysium", title: "Disco Elysium – The Final Cut", type: "game", steamAppId: 632470, developer: "ZA/UM", releaseDate: "2019-10-15", priceCents: 3999, stores: ["steam", "gog", "epic", "humble", "fanatical", "gmg"], saleNow: { store: "fanatical" } },
  { slug: "portal-2", title: "Portal 2", type: "game", steamAppId: 620, developer: "Valve", releaseDate: "2011-04-18", priceCents: 999, stores: ["steam"], maxCut: 90 },
  { slug: "doom-eternal", title: "DOOM Eternal", type: "game", steamAppId: 782330, developer: "id Software", releaseDate: "2020-03-20", priceCents: 5999, stores: ["steam", "humble", "fanatical", "gmg"], saleNow: { store: "steam", cut: 80 } },
];

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
/** Sample history starts here (about ten years back). */
const HISTORY_START = Date.UTC(2015, 10, 1);
/** Stores that opened after HISTORY_START. */
const STORE_OPENED: Record<string, number> = { epic: Date.UTC(2018, 11, 6) };
/** Chance a store joins a given sale event. */
const PARTICIPATION: Record<string, number> = { steam: 0.9, gog: 0.7, epic: 0.7, humble: 0.6, fanatical: 0.65, gmg: 0.65 };
/** Most games bottom out around 75% off; set `maxCut` per game to override. */
const DEFAULT_MAX_CUT = 75;
const CUT_TIERS = [10, 15, 20, 25, 30, 33, 35, 40, 50, 60, 65, 67, 70, 75, 80, 85, 90];
/** Permanent price-cut tiers, applied ~4 years after release to some games. */
const PRICE_CUT: Record<number, number> = { 5999: 3999, 3999: 2999, 2999: 1999, 2499: 1999, 1999: 1499, 1499: 999 };

// --- deterministic randomness -------------------------------------------------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- helpers --------------------------------------------------------------------

/** Store sales typically start at 10am Pacific (17:00 UTC). */
const at17 = (y: number, m: number, d: number) => Date.UTC(y, m, d, 17);
const iso = (ms: number) => new Date(ms).toISOString();

/** Discounted price, nudged to end in 9 like real store prices. */
function salePrice(regular: number, cut: number): number {
  if (cut === 0) return regular;
  return Math.max(99, Math.round((regular * (100 - cut)) / 1000) * 10 - 1);
}

interface SaleWindow {
  start: number;
  end: number;
  seasonal: boolean;
}

function saleWindows(year: number, rng: () => number): SaleWindow[] {
  const windows: SaleWindow[] = [
    { start: at17(year, 2, 14), end: at17(year, 2, 21), seasonal: true }, // spring
    { start: at17(year, 5, 26), end: at17(year, 6, 10), seasonal: true }, // summer
    { start: at17(year, 10, 26), end: at17(year, 11, 3), seasonal: true }, // autumn
    { start: at17(year, 11, 20), end: at17(year + 1, 0, 3), seasonal: true }, // winter
  ];
  // A couple of one-off publisher or midweek sales.
  for (let i = 0; i < 2; i++) {
    if (rng() < 0.55) {
      const start = at17(year, Math.floor(rng() * 11), 1 + Math.floor(rng() * 24));
      windows.push({ start, end: start + (4 + Math.floor(rng() * 7)) * DAY, seasonal: false });
    }
  }
  return windows.sort((a, b) => a.start - b.start);
}

function pickCut(ageYears: number, maxCut: number, seasonal: boolean, rng: () => number): number {
  const ceiling = Math.min(maxCut, 20 + ageYears * 15);
  const tiers = CUT_TIERS.filter((t) => t <= ceiling);
  if (tiers.length === 0) return 0;
  const span = Math.min(seasonal ? 3 : 6, tiers.length);
  // Seasonal sales sit near the deepest allowed tier; one-off sales vary more.
  return tiers[tiers.length - 1 - Math.floor(rng() * rng() * span)]!;
}

// --- generation -----------------------------------------------------------------

function generateListing(spec: SampleGameSpec, storeId: string, realNow: number): StoreListing {
  const delistedAt = spec.delisted?.store === storeId ? Date.parse(spec.delisted.on) : null;
  // A delisted store's history simply stops on the delisting date.
  const now = delistedAt ?? realNow;
  const rng = mulberry32(hashString(`${spec.slug}:${storeId}`));
  const release = Date.parse(spec.releaseDate);
  const listingStart = Math.max(release, HISTORY_START, STORE_OPENED[storeId] ?? 0);

  // Some older, pricier games get a permanent price cut about four years in.
  const cutTo = PRICE_CUT[spec.priceCents];
  const dropAt =
    cutTo && spec.priceCents >= 2499 && hashString(spec.slug) % 10 < 6 ? release + 4 * YEAR : Infinity;
  const regularAt = (t: number) => (t >= dropAt ? cutTo! : spec.priceCents);

  const history: PricePoint[] = [];
  const push = (t: number, cut: number) => {
    const regular = regularAt(t);
    history.push({ timestamp: iso(t), priceCents: salePrice(regular, cut), regularCents: regular, cut });
  };

  push(listingStart, 0);
  let lastEnd = listingStart;
  const offsetDays = storeId === "steam" ? 0 : Math.floor(rng() * 7) - 3;

  for (let year = new Date(listingStart).getUTCFullYear(); year <= new Date(now).getUTCFullYear(); year++) {
    for (const w of saleWindows(year, rng)) {
      const start = w.start + offsetDays * DAY;
      const end = w.end + offsetDays * DAY;
      const tooEarly = start < release + 60 * DAY || start <= lastEnd + DAY;
      const spansDrop = start < dropAt && end > dropAt;
      if (tooEarly || spansDrop || start >= now) continue;
      if (rng() > (PARTICIPATION[storeId] ?? 0.6)) continue;

      const cut = pickCut((start - release) / YEAR, spec.maxCut ?? DEFAULT_MAX_CUT, w.seasonal, rng);
      if (cut === 0) continue;
      if (dropAt > lastEnd && dropAt < start) push(dropAt, 0);
      push(start, cut);
      if (end < now) push(end, 0);
      lastEnd = end;
    }
  }
  if (dropAt > lastEnd && dropAt < now) push(dropAt, 0);

  return {
    storeId,
    url: storeId === "steam" ? `https://store.steampowered.com/app/${spec.steamAppId}` : null,
    available: delistedAt === null,
    history,
  };
}

/** Put a listing on sale "now", either at a given cut or matching the all-time low. */
function applySaleNow(spec: SampleGameSpec, listings: StoreListing[], now: number) {
  if (!spec.saleNow) return;
  const listing = listings.find((l) => l.storeId === spec.saleNow!.store);
  if (!listing) return;

  const saleStart = now - 4 * DAY;
  listing.history = listing.history.filter((p) => Date.parse(p.timestamp) < saleStart - 2 * DAY);
  const last = listing.history.at(-1)!;
  const regular = last.regularCents;
  if (last.cut > 0) {
    listing.history.push({ timestamp: iso(saleStart - 2 * DAY), priceCents: regular, regularCents: regular, cut: 0 });
  }

  let price: number;
  if (spec.saleNow.cut !== undefined) {
    price = salePrice(regular, spec.saleNow.cut);
  } else {
    const allPrices = listings.flatMap((l) => l.history.map((p) => p.priceCents));
    price = Math.min(...allPrices);
  }
  const cut = Math.round((1 - price / regular) * 100);
  listing.history.push({ timestamp: iso(saleStart), priceCents: price, regularCents: regular, cut });
}

function generateGame(spec: SampleGameSpec, now: number): GameDetail {
  const listings = spec.stores.map((storeId) => generateListing(spec, storeId, now));
  applySaleNow(spec, listings, now);
  const base = spec.baseGameSlug ? SPECS.find((s) => s.slug === spec.baseGameSlug) : undefined;
  return {
    slug: spec.slug,
    title: spec.title,
    type: spec.type,
    coverUrl: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${spec.steamAppId}/header.jpg`,
    developer: spec.developer,
    releaseDate: spec.releaseDate,
    baseGame: base ? { slug: base.slug, title: base.title } : null,
    sourceUrl: null,
    listings,
  };
}

let cache: GameDetail[] | null = null;

export function getSampleGames(): GameDetail[] {
  cache ??= SPECS.map((spec) => generateGame(spec, Date.now()));
  return cache;
}
