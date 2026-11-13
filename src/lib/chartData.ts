import type { StoreListing } from "../types";

/**
 * One row per moment a price changed at any store. Each row carries every
 * store's price at that moment (carried forward), so a step-line chart can
 * draw all stores on a shared time axis.
 *
 * Keys: `t` (epoch ms), `<storeId>` (price cents), `<storeId>:cut` (discount %).
 */
export type ChartRow = { t: number } & Record<string, number>;

interface ChangeEvent {
  t: number;
  storeId: string;
  priceCents: number;
  cut: number;
}

export function buildChartRows(
  listings: StoreListing[],
  rangeStartMs: number | null,
  nowMs: number,
): ChartRow[] {
  const events: ChangeEvent[] = listings
    .flatMap((l) =>
      l.history.map((p) => ({
        t: Date.parse(p.timestamp),
        storeId: l.storeId,
        priceCents: p.priceCents,
        cut: p.cut,
      })),
    )
    .sort((a, b) => a.t - b.t);

  const current: Record<string, number> = {};
  const rows: ChartRow[] = [];
  const snapshot = (t: number): ChartRow => ({ ...current, t });

  let i = 0;
  if (rangeStartMs !== null) {
    // Fold everything before the range into the starting values.
    while (i < events.length && events[i]!.t <= rangeStartMs) {
      apply(current, events[i]!);
      i++;
    }
    rows.push(snapshot(rangeStartMs));
  }

  while (i < events.length) {
    const t = events[i]!.t;
    // Apply every change sharing this timestamp before emitting a row.
    while (i < events.length && events[i]!.t === t) {
      apply(current, events[i]!);
      i++;
    }
    rows.push(snapshot(t));
  }

  // Extend every line to "now" so current prices are visible at the right edge.
  if (rows.length > 0 && rows.at(-1)!.t < nowMs) rows.push(snapshot(nowMs));
  return rows;
}

function apply(current: Record<string, number>, e: ChangeEvent) {
  current[e.storeId] = e.priceCents;
  current[`${e.storeId}:cut`] = e.cut;
}
