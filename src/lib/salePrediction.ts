/**
 * Sale forecasting from a game's price history.
 *
 * Store sales are very seasonal: Steam, GOG, Epic and the key shops run the
 * same big events every year at roughly the same time. So the forecast:
 *
 *   1. Finds every past sale "episode" (a stretch of time discounted at least
 *      MIN_SALE_CUT at one store) and groups episodes that start within a week
 *      of each other into one game-wide sale.
 *   2. For each recurring yearly event, checks the last few years: did this game
 *      go on sale during that event's window, how deep, and how many days in.
 *   3. Scores each upcoming event by how often the game joined it (its "chance")
 *      and how deep those sales went, then picks the next likely sale.
 *   4. Falls back to the game's general sale rhythm (median gap between sales)
 *      when no yearly event is a good bet.
 *
 * Everything is computed from the history already on the page, so it works the
 * same with sample data and live data.
 */
import { formatCents, formatDate } from "./format";
import { currentDeals, historicalLow } from "./priceStats";
import type { StoreListing } from "../types";
import { getStore } from "../config/stores";

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;

/** A discount smaller than this is noise (price tweaks), not a sale. */
export const MIN_SALE_CUT = 10;
/** Each yearly event is judged by this many most recent years. */
const RECENT_YEARS = 4;
/** Episodes at different stores starting this close together are one sale. */
const SAME_SALE_DAYS = 7;
/** An event counts as a likely sale from this chance up. */
const LIKELY = 0.5;

/** A recurring store event, as a yearly window of dates (UTC). */
export interface SaleEvent {
  id: string;
  name: string;
  /** Typical events that fall in this window. */
  examples: string;
  /** 0-based month and day the window opens. */
  month: number;
  day: number;
  lengthDays: number;
}

/**
 * Windows are deliberately wide: exact dates move a few days each year and
 * stores other than Steam often start a little early or late.
 */
export const SALE_EVENTS: SaleEvent[] = [
  { id: "lunar", name: "Lunar New Year sales", examples: "Steam Lunar New Year Sale", month: 0, day: 20, lengthDays: 26 },
  { id: "spring", name: "Spring sales", examples: "Steam Spring Sale", month: 2, day: 8, lengthDays: 24 },
  { id: "may", name: "May sales", examples: "Epic Mega Sale and other May promotions", month: 4, day: 8, lengthDays: 34 },
  { id: "summer", name: "Summer sales", examples: "Steam Summer Sale, GOG Summer Sale", month: 5, day: 15, lengthDays: 28 },
  { id: "halloween", name: "Halloween sales", examples: "Steam Scream Fest and Halloween promotions", month: 9, day: 20, lengthDays: 16 },
  { id: "autumn", name: "Black Friday & autumn sales", examples: "Steam Autumn Sale, Black Friday", month: 10, day: 15, lengthDays: 21 },
  { id: "winter", name: "Winter & holiday sales", examples: "Steam Winter Sale, Epic Holiday Sale", month: 11, day: 12, lengthDays: 28 },
];

/** A stretch of time one store had the game discounted. */
export interface SaleEpisode {
  storeId: string;
  start: number;
  /** Null while the sale is still running. */
  end: number | null;
  /** Deepest discount during the episode. */
  cut: number;
  /** Lowest price during the episode. */
  priceCents: number;
}

/** One game-wide sale: overlapping episodes at one or more stores. */
interface Sale {
  start: number;
  cut: number;
  /** The store with the deepest discount. */
  storeId: string;
}

export interface EventForecast {
  event: SaleEvent;
  /** Best guess for when the next occurrence starts (epoch ms). */
  expectedStart: number;
  /** 0–1: how likely this game is to be discounted during the next occurrence. */
  chance: number;
  hits: number;
  observed: number;
  /** Median deepest discount in past occurrences the game joined. */
  typicalCut: number | null;
  expectedPriceCents: number | null;
  likelyStoreId: string | null;
  /** Recent years, oldest first: deepest discount that year, or null if the game wasn't discounted. */
  record: { year: number; cut: number | null }[];
}

export interface NextSale {
  expectedStart: number;
  label: string;
  /** Null for estimates from the general sale rhythm. */
  chance: number | null;
  typicalCut: number | null;
  expectedPriceCents: number | null;
  basis: "event" | "rhythm";
}

export type VerdictKind = "buy" | "wait" | "neutral" | "unknown";

export interface SaleForecast {
  verdict: { kind: VerdictKind; headline: string; detail: string };
  next: NextSale | null;
  /** Upcoming yearly events with enough history to judge, soonest first. */
  events: EventForecast[];
  onSaleNow: boolean;
  /** Average number of sales a year over the last three years. */
  salesPerYear: number;
  /** Median days between the start of one sale and the next (last three years). */
  medianGapDays: number | null;
  /** Median deepest discount of the game's recent sales. */
  typicalCut: number | null;
  lastSaleStart: number | null;
  trackedSince: number;
}

// --- building blocks -------------------------------------------------------------

/** Every sale episode at every store, oldest first. */
export function saleEpisodes(listings: StoreListing[]): SaleEpisode[] {
  const out: SaleEpisode[] = [];
  for (const listing of listings) {
    let open: SaleEpisode | null = null;
    for (const p of listing.history) {
      const t = Date.parse(p.timestamp);
      if (p.cut >= MIN_SALE_CUT) {
        if (!open) {
          open = { storeId: listing.storeId, start: t, end: null, cut: p.cut, priceCents: p.priceCents };
          out.push(open);
        } else {
          open.cut = Math.max(open.cut, p.cut);
          open.priceCents = Math.min(open.priceCents, p.priceCents);
        }
      } else if (open) {
        open.end = t;
        open = null;
      }
    }
    // A store that stopped selling the game isn't running a sale any more.
    const last = listing.history.at(-1);
    if (open && !listing.available && last) open.end = Date.parse(last.timestamp);
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Merge episodes that start within a week of each other into game-wide sales. */
function groupSales(episodes: SaleEpisode[]): Sale[] {
  const sales: Sale[] = [];
  for (const ep of episodes) {
    const current = sales.at(-1);
    if (current && ep.start - current.start <= SAME_SALE_DAYS * DAY) {
      if (ep.cut > current.cut) {
        current.cut = ep.cut;
        current.storeId = ep.storeId;
      }
    } else {
      sales.push({ start: ep.start, cut: ep.cut, storeId: ep.storeId });
    }
  }
  return sales;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Most common value; ties go to the one seen last. */
function mode<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  let best: T | null = null;
  let bestCount = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n >= bestCount) {
      best = v;
      bestCount = n;
    }
  }
  return best;
}

function windowFor(event: SaleEvent, year: number) {
  const start = Date.UTC(year, event.month, event.day);
  return { year, start, end: start + event.lengthDays * DAY };
}

/** Stores round sale prices down ($9.99 at 90% off is $0.99). */
const salePrice = (regularCents: number, cut: number) => Math.floor((regularCents * (100 - cut)) / 100);

// --- per-event forecast ----------------------------------------------------------

function forecastEvent(
  event: SaleEvent,
  sales: Sale[],
  trackedSince: number,
  now: number,
  regularAt: (storeId: string | null) => number,
): EventForecast | null {
  // Past occurrences the game was tracked for the whole of, most recent last.
  const firstYear = new Date(trackedSince).getUTCFullYear();
  const nowYear = new Date(now).getUTCFullYear();
  const past = [];
  for (let y = firstYear; y <= nowYear; y++) {
    const w = windowFor(event, y);
    if (w.start >= trackedSince && w.end <= now) past.push(w);
  }
  const recent = past.slice(-RECENT_YEARS);
  if (recent.length === 0) return null;

  const record: EventForecast["record"] = [];
  const hitCuts: number[] = [];
  const hitOffsets: number[] = [];
  const hitStores: string[] = [];
  for (const w of recent) {
    const inWindow = sales.filter((s) => s.start >= w.start && s.start < w.end);
    if (inWindow.length === 0) {
      record.push({ year: w.year, cut: null });
      continue;
    }
    const deepest = inWindow.reduce((a, b) => (b.cut > a.cut ? b : a));
    record.push({ year: w.year, cut: deepest.cut });
    hitCuts.push(deepest.cut);
    hitOffsets.push(inWindow[0]!.start - w.start);
    hitStores.push(deepest.storeId);
  }

  const hits = hitCuts.length;
  // Smoothed rate: one year of data is weak evidence, so 1 of 1 reads as 75%, not 100%.
  const chance = (hits + 0.5) / (recent.length + 1);
  const typicalCut = median(hitCuts);
  const likelyStoreId = mode(hitStores);

  // Next occurrence whose expected start (window open + typical delay) is still ahead.
  const offset = median(hitOffsets) ?? 0;
  let expectedStart = 0;
  for (let y = nowYear - 1; y <= nowYear + 1; y++) {
    const start = windowFor(event, y).start + offset;
    if (start > now) {
      expectedStart = start;
      break;
    }
  }

  return {
    event,
    expectedStart,
    chance,
    hits,
    observed: recent.length,
    typicalCut: typicalCut === null ? null : Math.round(typicalCut),
    expectedPriceCents: typicalCut === null ? null : salePrice(regularAt(likelyStoreId), Math.round(typicalCut)),
    likelyStoreId,
    record,
  };
}

// --- the forecast ----------------------------------------------------------------

export function forecastSales(listings: StoreListing[], now: number): SaleForecast | null {
  const withHistory = listings.filter((l) => l.history.length > 0);
  if (withHistory.length === 0) return null;
  const trackedSince = Math.min(...withHistory.map((l) => Date.parse(l.history[0]!.timestamp)));

  const deals = currentDeals(listings);
  const best = deals[0] ?? null;
  if (best && best.regularCents === 0) return null; // free to play: nothing to forecast

  const regularAt = (storeId: string | null) =>
    deals.find((d) => d.storeId === storeId)?.regularCents ?? best?.regularCents ?? 0;

  const sales = groupSales(saleEpisodes(listings));
  const events = SALE_EVENTS.map((e) => forecastEvent(e, sales, trackedSince, now, regularAt))
    .filter((e): e is EventForecast => e !== null)
    .sort((a, b) => a.expectedStart - b.expectedStart);

  // General rhythm over the last three years.
  const windowStart = Math.max(trackedSince, now - 3 * YEAR);
  const recentSales = sales.filter((s) => s.start >= windowStart);
  const yearsWatched = (now - windowStart) / YEAR;
  const salesPerYear = yearsWatched >= 0.5 ? recentSales.length / yearsWatched : 0;
  const gaps = recentSales.slice(1).map((s, i) => (s.start - recentSales[i]!.start) / DAY);
  const medianGapDays = gaps.length >= 2 ? Math.round(median(gaps)!) : null;
  const typicalCut = median(sales.slice(-6).map((s) => s.cut));
  const lastSaleStart = sales.at(-1)?.start ?? null;

  const next = pickNext(events, lastSaleStart, medianGapDays, recentSales.length, typicalCut, regularAt(best?.storeId ?? null), now);
  const onSaleNow = Boolean(best && best.cut >= MIN_SALE_CUT);

  const verdict = decide({
    listings,
    best,
    next,
    onSaleNow,
    typicalCut: typicalCut === null ? null : Math.round(typicalCut),
    salesPerYear,
    saleCount: sales.length,
    trackedYears: (now - trackedSince) / YEAR,
    now,
  });

  return {
    verdict,
    next,
    events,
    onSaleNow,
    salesPerYear,
    medianGapDays,
    typicalCut: typicalCut === null ? null : Math.round(typicalCut),
    lastSaleStart,
    trackedSince,
  };
}

function pickNext(
  events: EventForecast[],
  lastSaleStart: number | null,
  medianGapDays: number | null,
  recentSaleCount: number,
  typicalCut: number | null,
  regularCents: number,
  now: number,
): NextSale | null {
  const likely = events.find((e) => e.chance >= LIKELY);
  if (likely) {
    return {
      expectedStart: likely.expectedStart,
      label: likely.event.name,
      chance: likely.chance,
      typicalCut: likely.typicalCut,
      expectedPriceCents: likely.expectedPriceCents,
      basis: "event",
    };
  }
  // No yearly event is a good bet; fall back to the general rhythm if it's regular enough.
  if (lastSaleStart !== null && medianGapDays !== null && recentSaleCount >= 4) {
    const expectedStart = lastSaleStart + medianGapDays * DAY;
    if (expectedStart > now) {
      const cut = typicalCut === null ? null : Math.round(typicalCut);
      return {
        expectedStart,
        label: "its usual sale rhythm",
        chance: null,
        typicalCut: cut,
        expectedPriceCents: cut === null ? null : salePrice(regularCents, cut),
        basis: "rhythm",
      };
    }
  }
  return null;
}

interface DecideInput {
  listings: StoreListing[];
  best: ReturnType<typeof currentDeals>[number] | null;
  next: NextSale | null;
  onSaleNow: boolean;
  typicalCut: number | null;
  salesPerYear: number;
  saleCount: number;
  trackedYears: number;
  now: number;
}

function decide(input: DecideInput): SaleForecast["verdict"] {
  const { best, next, onSaleNow, typicalCut, now } = input;
  if (!best) {
    return { kind: "unknown", headline: "Not currently sold", detail: "None of the stores we track sell this game right now." };
  }

  const low = historicalLow(input.listings);
  const where = getStore(best.storeId).name;
  const daysToNext = next ? (next.expectedStart - now) / DAY : Infinity;
  const nextText = next ? describeNext(next) : "";

  // On sale at (or within 5% of) the lowest price ever: nothing to wait for.
  if (onSaleNow && low && best.priceCents <= Math.ceil(low.priceCents * 1.05)) {
    const exact = best.priceCents <= low.priceCents;
    return {
      kind: "buy",
      headline: "Buy now",
      detail: `${formatCents(best.priceCents)} at ${where} is ${exact ? "the lowest price on record" : "within 5% of the lowest price on record"}.`,
    };
  }

  if (input.saleCount < 2 || input.trackedYears < 0.75) {
    return {
      kind: "unknown",
      headline: "Not enough history yet",
      detail: `We've seen ${input.saleCount === 1 ? "only one sale" : "no sales"} so far. Forecasts need a few past sales to spot a pattern.`,
    };
  }

  if (onSaleNow) {
    const deeperSoon = next?.typicalCut != null && next.typicalCut >= best.cut + 10 && daysToNext <= 75;
    if (deeperSoon) {
      return {
        kind: "wait",
        headline: "A deeper sale is likely soon",
        detail: `It's ${best.cut}% off now, but ${nextText}.`,
      };
    }
    if (typicalCut === null || best.cut >= typicalCut - 5) {
      return {
        kind: "buy",
        headline: "Good time to buy",
        detail: `${best.cut}% off at ${where} is in line with this game's usual sales${typicalCut ? ` (typically ${typicalCut}% off)` : ""}.`,
      };
    }
    return {
      kind: "neutral",
      headline: "Decent, but sales usually go deeper",
      detail: `It's ${best.cut}% off now; recent sales reached about ${typicalCut}% off.${next ? ` Next: ${nextText}.` : ""}`,
    };
  }

  if (next && daysToNext <= 60) {
    return { kind: "wait", headline: "Wait for a sale", detail: `${capitalize(nextText)}.` };
  }
  if (next) {
    return { kind: "neutral", headline: "No sale expected soon", detail: `Next likely sale: ${nextText}.` };
  }
  if (input.salesPerYear < 0.5) {
    return {
      kind: "neutral",
      headline: "Rarely discounted",
      detail: "This game has seldom gone on sale in the last three years, so waiting may not pay off.",
    };
  }
  return {
    kind: "neutral",
    headline: "No clear sale pattern",
    detail: `It goes on sale about ${Math.round(input.salesPerYear)} times a year, but not at predictable times.`,
  };
}

function describeNext(next: NextSale): string {
  const when = `around ${formatDate(next.expectedStart)}`;
  const depth =
    next.typicalCut !== null
      ? `, typically ~${next.typicalCut}% off${next.expectedPriceCents !== null ? ` (about ${formatCents(next.expectedPriceCents)})` : ""}`
      : "";
  return next.basis === "event"
    ? `${next.label} usually discount it ${when}${depth}`
    : `based on ${next.label}, the next sale is due ${when}${depth}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// --- sale calendar ---------------------------------------------------------------

export interface CalendarYear {
  year: number;
  /** Deepest discount at any store per month: null = not tracked, 0 = no sale. */
  months: (number | null)[];
}

/** Deepest discount in each month, for a year-by-month heatmap (most recent year last). */
export function saleCalendar(listings: StoreListing[], now: number, maxYears = 10): CalendarYear[] {
  const withHistory = listings.filter((l) => l.history.length > 0);
  if (withHistory.length === 0) return [];
  const trackedSince = Math.min(...withHistory.map((l) => Date.parse(l.history[0]!.timestamp)));
  const lastYear = new Date(now).getUTCFullYear();
  const firstYear = Math.max(new Date(trackedSince).getUTCFullYear(), lastYear - maxYears + 1);

  const years: CalendarYear[] = [];
  for (let y = firstYear; y <= lastYear; y++) {
    const months: (number | null)[] = [];
    for (let m = 0; m < 12; m++) {
      const start = Date.UTC(y, m, 1);
      const end = Date.UTC(y, m + 1, 1);
      months.push(end <= trackedSince || start > now ? null : 0);
    }
    years.push({ year: y, months });
  }

  for (const listing of withHistory) {
    const h = listing.history;
    for (let i = 0; i < h.length; i++) {
      const p = h[i]!;
      if (p.cut < MIN_SALE_CUT) continue;
      const from = Date.parse(p.timestamp);
      const next = h[i + 1];
      const to = next ? Date.parse(next.timestamp) : listing.available ? now : from;
      // Mark every month this discounted stretch touches.
      const cursor = new Date(Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), 1));
      while (cursor.getTime() <= to) {
        const row = years.find((r) => r.year === cursor.getUTCFullYear());
        const m = cursor.getUTCMonth();
        if (row && row.months[m] !== null) row.months[m] = Math.max(row.months[m]!, p.cut);
        cursor.setUTCMonth(m + 1);
      }
    }
  }
  return years;
}
