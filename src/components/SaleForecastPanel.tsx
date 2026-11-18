import { CalendarClock, CircleHelp, Hourglass, ShoppingCart, type LucideIcon } from "lucide-react";
import { formatCents, formatDate, formatDaysUntil } from "../lib/format";
import {
  eventWindow,
  type CalendarYear,
  type EventForecast,
  type SaleForecast,
  type VerdictKind,
} from "../lib/salePrediction";
import { LikelihoodBadge, StoreLabel } from "./Badges";
import { Panel, TH } from "./Panel";

const VERDICT_STYLE: Record<VerdictKind, { icon: LucideIcon; tone: string; iconTone: string }> = {
  buy: { icon: ShoppingCart, tone: "border-l-deal", iconTone: "text-deal" },
  wait: { icon: Hourglass, tone: "border-l-atl", iconTone: "text-atl" },
  neutral: { icon: CalendarClock, tone: "border-l-accent", iconTone: "text-accent" },
  unknown: { icon: CircleHelp, tone: "border-l-faint", iconTone: "text-muted" },
};

/** The buy-or-wait answer, as a large banner at the top of the game page. */
export function SaleVerdict({ forecast }: { forecast: SaleForecast }) {
  const { verdict } = forecast;
  const style = VERDICT_STYLE[verdict.kind];
  const Icon = style.icon;
  return (
    <section className={`flex items-center gap-4 rounded border border-l-4 border-line bg-surface px-5 py-4 ${style.tone}`}>
      <Icon className={`size-8 shrink-0 ${style.iconTone}`} aria-hidden />
      <div>
        <h2 className="text-xl font-semibold">{verdict.headline}</h2>
        <p className="mt-0.5 text-[15px] text-muted">{verdict.detail}</p>
      </div>
    </section>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Upcoming sale seasons for this game, plus a month-by-month record of past sales. */
export function UpcomingSalesPanel({ forecast, calendar }: { forecast: SaleForecast; calendar: CalendarYear[] }) {
  if (forecast.events.length === 0 && calendar.length === 0) return null;
  return (
    <Panel title="Upcoming sales">
      {forecast.events.length > 0 && <EventTable events={forecast.events} />}
      {calendar.length > 0 && <SaleCalendar calendar={calendar} />}
    </Panel>
  );
}

function EventTable({ events }: { events: EventForecast[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr className="border-b border-line">
            <th className={TH}>Sale season</th>
            <th className={TH}>Expected</th>
            <th className={TH}>Chance</th>
            <th className={`${TH} text-right`}>Usually</th>
            <th className={`${TH} text-right`}>Price then</th>
            <th className={TH}>Past years</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.event.id} className="border-b border-line/60 last:border-0">
              <td className="px-3 py-2">
                <div className="font-medium">{e.event.name}</div>
                <div className="text-xs text-faint">{eventWindow(e.event)}</div>
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                {formatDate(e.expectedStart)}
                <div className="text-xs text-muted">{formatDaysUntil(e.expectedStart)}</div>
              </td>
              <td className="px-3 py-2">
                <LikelihoodBadge chance={e.chance} />
              </td>
              <td className="px-3 py-2 text-right">{e.typicalCut != null ? `${e.typicalCut}% off` : "—"}</td>
              <td className="px-3 py-2 text-right">
                {e.expectedPriceCents != null ? <span className="font-medium">~{formatCents(e.expectedPriceCents)}</span> : "—"}
                {e.likelyStoreId && (
                  <div className="text-xs text-faint" title="Where this game was cheapest during this season in past years">
                    cheapest at <StoreLabel storeId={e.likelyStoreId} />
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

/** One square per recent year, oldest first: filled if the game was on sale that season, empty if not. */
function TrackRecord({ record, hits }: { record: EventForecast["record"]; hits: number }) {
  const summary = record.map((r) => `${r.year}: ${r.cut === null ? "no sale" : "on sale"}`).join(", ");
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5" role="img" aria-label={summary}>
        {record.map((r) => (
          <span
            key={r.year}
            className={`size-2.5 rounded-[2px] ${r.cut === null ? "border border-line" : "bg-deal"}`}
          />
        ))}
      </div>
      <span className="whitespace-nowrap text-xs text-faint">
        on sale {hits} of {record.length} years
      </span>
    </div>
  );
}

/** Deeper discounts get a stronger green. */
const heat = (cut: number) => `color-mix(in oklab, var(--color-deal) ${Math.round(25 + cut * 0.75)}%, transparent)`;

function SaleCalendar({ calendar }: { calendar: CalendarYear[] }) {
  return (
    <div className="border-t border-line px-3 py-3">
      <h3 className="mb-2 text-sm font-medium">Past sales by month</h3>
      <div className="grid grid-cols-[2.75rem_repeat(12,minmax(0,1fr))] gap-0.5 text-xs">
        <span />
        {MONTHS.map((m) => (
          <span key={m} className="text-center text-faint">
            {m.charAt(0)}
            <span className="hidden md:inline">{m.slice(1)}</span>
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
        const label = `${MONTHS[m]} ${year}: ${cut === null ? "not tracked" : cut === 0 ? "no sale" : `up to ${cut}% off`}`;
        return (
          <span
            key={m}
            title={label}
            aria-label={label}
            className={`flex h-6 items-center justify-center rounded-[2px] ${
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
