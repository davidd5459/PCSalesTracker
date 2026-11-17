import { CalendarClock, CircleHelp, Hourglass, ShoppingCart, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { formatCents, formatDate } from "../lib/format";
import { forecastSales, saleCalendar, type EventForecast, type VerdictKind } from "../lib/salePrediction";
import type { StoreListing } from "../types";
import { StoreLabel } from "./Badges";
import { Panel, TH } from "./Panel";

const VERDICT_STYLE: Record<VerdictKind, { icon: LucideIcon; tone: string }> = {
  buy: { icon: ShoppingCart, tone: "border-deal/50 bg-deal/5 text-deal" },
  wait: { icon: Hourglass, tone: "border-atl/50 bg-atl/5 text-atl" },
  neutral: { icon: CalendarClock, tone: "border-accent/40 bg-accent/5 text-accent" },
  unknown: { icon: CircleHelp, tone: "border-line bg-surface-2 text-muted" },
};

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Predicts the next sale from past sales and recurring yearly store events. */
export function SaleForecastPanel({ listings }: { listings: StoreListing[] }) {
  const { forecast, calendar } = useMemo(() => {
    const now = Date.now();
    return { forecast: forecastSales(listings, now), calendar: saleCalendar(listings, now) };
  }, [listings]);

  if (!forecast) return null;
  const { verdict, next } = forecast;
  const style = VERDICT_STYLE[verdict.kind];
  const Icon = style.icon;
  const years = Math.max(1, Math.round((Date.now() - forecast.trackedSince) / (365.25 * 86_400_000)));

  return (
    <Panel title="Sale forecast" meta={`Based on ${years} year${years === 1 ? "" : "s"} of price history`}>
      <div className="space-y-3 p-3">
        <div className={`flex gap-3 rounded border px-3 py-2.5 ${style.tone}`}>
          <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{verdict.headline}</p>
            <p className="mt-0.5 text-[13px] text-ink/85">{verdict.detail}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-4">
          <Stat label="Next likely sale" value={next ? formatDate(next.expectedStart) : "—"} sub={next?.label} />
          <Stat
            label="Expected discount"
            value={next?.typicalCut != null ? `~${next.typicalCut}%` : "—"}
            sub={next?.expectedPriceCents != null ? `about ${formatCents(next.expectedPriceCents)}` : undefined}
            valueClass="text-deal"
          />
          <Stat
            label="Sales per year"
            value={forecast.salesPerYear > 0 ? forecast.salesPerYear.toFixed(1) : "0"}
            sub={forecast.medianGapDays ? `every ~${forecast.medianGapDays} days` : "last 3 years"}
          />
          <Stat
            label="Typical discount"
            value={forecast.typicalCut != null ? `${forecast.typicalCut}%` : "—"}
            sub={forecast.lastSaleStart ? `last sale ${formatDate(forecast.lastSaleStart)}` : undefined}
          />
        </dl>
      </div>

      {forecast.events.length > 0 && <EventTable events={forecast.events} />}
      {calendar.length > 0 && <SaleCalendar calendar={calendar} />}

      <p className="border-t border-line px-3 py-2 text-[11px] text-faint">
        Estimates from this game's past sales and recurring store events. Stores set their own schedules, so
        treat these as likely, not guaranteed.
      </p>
    </Panel>
  );
}

function Stat({ label, value, sub, valueClass = "" }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="bg-surface px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wider text-faint">{label}</dt>
      <dd className={`mt-0.5 font-mono text-[15px] font-semibold ${valueClass}`}>{value}</dd>
      {sub && <dd className="truncate text-[11px] text-muted" title={sub}>{sub}</dd>}
    </div>
  );
}

function EventTable({ events }: { events: EventForecast[] }) {
  return (
    <div className="overflow-x-auto border-t border-line">
      <table className="w-full min-w-[620px]">
        <thead>
          <tr className="border-b border-line">
            <th className={TH}>Upcoming event</th>
            <th className={TH}>Expected</th>
            <th className={TH}>Chance</th>
            <th className={`${TH} text-right`}>Typical</th>
            <th className={`${TH} text-right`}>Est. price</th>
            <th className={TH}>Past years</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.event.id} className="border-b border-line/60 text-[13px] last:border-0">
              <td className="px-3 py-2">
                <div className="font-medium">{e.event.name}</div>
                <div className="text-[11px] text-faint">{e.event.examples}</div>
              </td>
              <td className="px-3 py-2 font-mono whitespace-nowrap">{formatDate(e.expectedStart)}</td>
              <td className="px-3 py-2">
                <ChanceBar chance={e.chance} />
              </td>
              <td className="px-3 py-2 text-right font-mono">{e.typicalCut != null ? `-${e.typicalCut}%` : "—"}</td>
              <td className="px-3 py-2 text-right">
                {e.expectedPriceCents != null ? (
                  <span className="font-mono">{formatCents(e.expectedPriceCents)}</span>
                ) : (
                  "—"
                )}
                {e.likelyStoreId && (
                  <div className="text-[11px] text-faint">
                    <StoreLabel storeId={e.likelyStoreId} />
                  </div>
                )}
              </td>
              <td className="px-3 py-2">
                <TrackRecord record={e.record} hits={e.hits} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChanceBar({ chance }: { chance: number }) {
  const pct = Math.round(chance * 100);
  const color = chance >= 0.7 ? "bg-deal" : chance >= 0.5 ? "bg-accent" : "bg-faint";
  return (
    <div className="flex items-center gap-2" title={`${pct}% chance of a sale`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 font-mono text-xs text-muted">{pct}%</span>
    </div>
  );
}

function TrackRecord({ record, hits }: { record: EventForecast["record"]; hits: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {record.map((r) => (
          <span
            key={r.year}
            className={`size-2.5 rounded-[2px] ${r.cut === null ? "border border-line" : ""}`}
            style={r.cut === null ? undefined : { backgroundColor: heat(r.cut) }}
            title={r.cut === null ? `${r.year}: no sale` : `${r.year}: up to ${r.cut}% off`}
          />
        ))}
      </div>
      <span className="text-[11px] whitespace-nowrap text-faint">
        {hits} of {record.length} yrs
      </span>
    </div>
  );
}

/** Deeper discounts get a stronger green. */
const heat = (cut: number) => `color-mix(in oklab, var(--color-deal) ${Math.round(25 + cut * 0.75)}%, transparent)`;

function SaleCalendar({ calendar }: { calendar: ReturnType<typeof saleCalendar> }) {
  return (
    <div className="border-t border-line px-3 py-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold">Sale calendar</h3>
        <span className="text-[11px] text-faint">Deepest discount at any store, by month</span>
      </div>
      <div className="grid grid-cols-[2.5rem_repeat(12,minmax(0,1fr))] gap-0.5 font-mono text-[10px]">
        <span />
        {MONTHS.map((m, i) => (
          <span key={i} className="text-center text-faint" title={MONTH_NAMES[i]}>
            {m}
          </span>
        ))}
        {calendar.map((row) => (
          <CalendarRow key={row.year} year={row.year} months={row.months} />
        ))}
      </div>
    </div>
  );
}

function CalendarRow({ year, months }: { year: number; months: (number | null)[] }) {
  return (
    <>
      <span className="self-center text-faint">{year}</span>
      {months.map((cut, m) => {
        const label = `${MONTH_NAMES[m]} ${year}: ${cut === null ? "not tracked" : cut === 0 ? "no sale" : `up to ${cut}% off`}`;
        return (
          <span
            key={m}
            title={label}
            aria-label={label}
            className={`flex h-5 items-center justify-center rounded-[2px] ${
              cut === null ? "" : cut === 0 ? "bg-surface-2" : `font-semibold ${cut >= 45 ? "text-bg" : "text-ink"}`
            }`}
            style={cut ? { backgroundColor: heat(cut) } : undefined}
          >
            {cut ? cut : ""}
          </span>
        );
      })}
    </>
  );
}
