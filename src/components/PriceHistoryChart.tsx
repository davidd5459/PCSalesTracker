import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compareStores, getStore } from "../config/stores";
import { buildChartRows, type ChartRow } from "../lib/chartData";
import { formatAxisCents, formatCents, formatDate, formatDayMonth, formatMonthYear, formatYear } from "../lib/format";
import type { HistoricalLow, StoreListing } from "../types";

// SVG attributes can't read CSS variables, so the chart uses literal colors.
const COLORS = { grid: "#22272d", axis: "#616a75", low: "#ff9f43", cursor: "#3a414a" };
const DAY = 86_400_000;
const YEAR = 365.25 * DAY;

const RANGES = [
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 91 },
  { id: "6m", label: "6M", days: 182 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "2y", label: "2Y", days: 730 },
  { id: "5y", label: "5Y", days: 1826 },
  { id: "10y", label: "10Y", days: 3652 },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

interface Props {
  listings: StoreListing[];
  historicalLow: HistoricalLow | null;
  /** Stores hidden via the shop filter. */
  hidden: Set<string>;
}

export function PriceHistoryChart({ listings, historicalLow, hidden }: Props) {
  const [rangeId, setRangeId] = useState<RangeId>("1y");
  const [fitToData, setFitToData] = useState(false);
  const [now] = useState(() => Date.now());

  const visibleIds = useMemo(
    () => listings.map((l) => l.storeId).filter((id) => !hidden.has(id)).sort(compareStores),
    [listings, hidden],
  );

  const firstEvent = useMemo(
    () => Math.min(...listings.flatMap((l) => l.history.map((p) => Date.parse(p.timestamp)))),
    [listings],
  );
  const range = RANGES.find((r) => r.id === rangeId)!;
  // Never start before the first recorded price.
  const rangeStart = Math.max(now - range.days * DAY, firstEvent);

  const rows = useMemo(() => buildChartRows(listings, rangeStart, now), [listings, rangeStart, now]);
  const ticks = useMemo(() => timeTicks(rangeStart, now), [rangeStart, now]);
  const span = now - rangeStart;
  const tickLabel = span <= 45 * DAY ? formatDayMonth : span <= 2.5 * YEAR ? formatMonthYear : formatYear;

  return (
    <div>
      <div className="h-[320px] w-full px-1 pt-3">
        {visibleIds.length === 0 ? (
          <div className="grid h-full place-items-center text-[13px] text-muted">Select at least one store.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 4 }}>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={[rangeStart, now]}
                ticks={ticks}
                tickFormatter={(t: number) => tickLabel(t)}
                stroke={COLORS.axis}
                tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                tickFormatter={(v: number) => formatAxisCents(v)}
                domain={
                  fitToData
                    ? [(min: number) => Math.max(0, Math.floor(min * 0.9)), (max: number) => Math.ceil(max * 1.05)]
                    : [0, (max: number) => Math.ceil(max * 1.1)]
                }
                allowDecimals={false}
                stroke={COLORS.axis}
                tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip
                cursor={{ stroke: COLORS.cursor }}
                isAnimationActive={false}
                content={({ active, payload }) => (
                  <ChartTooltip
                    active={active}
                    row={payload?.[0]?.payload as ChartRow | undefined}
                    storeIds={visibleIds}
                    now={now}
                  />
                )}
              />
              {historicalLow && (
                <ReferenceLine
                  y={historicalLow.priceCents}
                  stroke={COLORS.low}
                  strokeDasharray="4 4"
                  strokeOpacity={0.8}
                  ifOverflow="hidden"
                />
              )}
              {visibleIds.map((id) => (
                <Line
                  key={id}
                  dataKey={id}
                  name={getStore(id).name}
                  type="stepAfter"
                  stroke={getStore(id).color}
                  strokeWidth={1.75}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="font-mono">
            {formatDate(rangeStart)} → {formatDate(now)}
          </span>
          {historicalLow && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t border-dashed border-atl" aria-hidden />
              All-time low {formatCents(historicalLow.priceCents)}
            </span>
          )}
          <label className="flex cursor-pointer items-center gap-1.5 select-none">
            <input
              type="checkbox"
              checked={fitToData}
              onChange={(e) => setFitToData(e.target.checked)}
              className="accent-[#4fd1c5]"
            />
            Fit price axis to data
          </label>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Time range">
          <span className="mr-1 text-xs text-faint">Zoom</span>
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={r.id === rangeId}
              onClick={() => setRangeId(r.id)}
              className={`rounded-sm px-2 py-0.5 font-mono text-xs transition-colors ${
                r.id === rangeId ? "bg-accent text-bg" : "bg-surface-2 text-muted hover:text-ink"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChartTooltip({
  active,
  row,
  storeIds,
  now,
}: {
  active?: boolean;
  row?: ChartRow;
  storeIds: string[];
  now: number;
}) {
  if (!active || !row) return null;
  const entries = storeIds
    .filter((id) => typeof row[id] === "number")
    .map((id) => ({ id, price: row[id]!, cut: row[`${id}:cut`] ?? 0 }))
    .sort((a, b) => a.price - b.price);
  if (entries.length === 0) return null;
  const lowest = entries[0]!.price;

  return (
    <div className="min-w-56 rounded border border-line bg-surface px-3 py-2 text-xs shadow-xl shadow-black/60">
      <div className="mb-1.5 font-mono text-faint">{row.t >= now ? "Today" : formatDate(row.t)}</div>
      <table className="w-full">
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="py-0.5 pr-3">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-[2px]" style={{ backgroundColor: getStore(e.id).color }} />
                  {getStore(e.id).name}
                </span>
              </td>
              <td className="py-0.5 pr-2 text-right font-mono text-deal">{e.cut > 0 ? `-${e.cut}%` : ""}</td>
              <td className={`py-0.5 text-right font-mono ${e.price === lowest ? "font-semibold text-ink" : "text-muted"}`}>
                {formatCents(e.price)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Axis ticks on calendar boundaries (weeks, months or years), spaced to the visible span. */
function timeTicks(start: number, end: number): number[] {
  const span = end - start;
  const ticks: number[] = [];

  if (span <= 45 * DAY) {
    const d = new Date(start);
    for (let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); t <= end; t += 7 * DAY) {
      ticks.push(t);
    }
    return ticks;
  }

  const stepMonths = span <= 200 * DAY ? 1 : span <= 1.5 * YEAR ? 2 : span <= 2.5 * YEAR ? 3 : 12;
  const d = new Date(start);
  const year = d.getUTCFullYear();
  let month = d.getUTCMonth() + 1;
  while (month % stepMonths !== 0) month++;
  for (let t = Date.UTC(year, month, 1); t <= end; t = Date.UTC(year, month, 1)) {
    ticks.push(t);
    month += stepMonths;
  }
  return ticks;
}
