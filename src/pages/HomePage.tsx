import { useEffect, type ReactNode } from "react";
import { useHomeSections } from "../api/queries";
import { AtlBadge, DiscountBadge, StoreLabel } from "../components/Badges";
import { GameCell } from "../components/GameCell";
import { Panel, TH } from "../components/Panel";
import { SearchBar } from "../components/SearchBar";
import { STORES } from "../config/stores";
import { formatCents, formatDate, formatInteger, formatRelative } from "../lib/format";
import type { GameSummary, PriceChange, UpcomingSale } from "../types";

export function HomePage() {
  const { data, isPending, isError } = useHomeSections();

  useEffect(() => {
    document.title = "PCSalesTracker · PC game price history";
  }, []);

  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-9">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
            Price history for PC games, <span className="text-accent">across every major store.</span>
          </h1>
          <p className="mt-2 max-w-2xl text-muted">
            PCSalesTracker records every price change on {STORES.map((s) => s.name).join(", ").replace(/, ([^,]*)$/, " and $1")}, so
            you can see whether today's sale is actually a good deal.
          </p>
          <div className="mt-5 max-w-xl">
            <SearchBar size="lg" autoFocus />
          </div>
          {data && (
            <p className="mt-3 font-mono text-xs text-faint">
              {formatInteger(data.stats.games)} games · {data.stats.stores} stores ·{" "}
              {formatInteger(data.stats.priceChanges)} price changes recorded
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 pt-6 lg:grid-cols-2">
        <Panel title="Sales expected soon" meta="Forecast from each game's sale history" className="lg:col-span-2">
          <Body loading={isPending} error={isError} empty={data?.upcomingSales.length === 0}>
            <UpcomingTable sales={data?.upcomingSales ?? []} />
          </Body>
        </Panel>

        <Panel title="Biggest discounts" meta="Deepest cuts right now">
          <Body loading={isPending} error={isError} empty={data?.biggestSales.length === 0}>
            <DealTable games={data?.biggestSales ?? []} />
          </Body>
        </Panel>

        <Panel title="At all-time low" meta="Cheapest they have ever been">
          <Body loading={isPending} error={isError} empty={data?.atHistoricalLow.length === 0}>
            <DealTable games={data?.atHistoricalLow ?? []} showAtl />
          </Body>
        </Panel>

        <Panel title="Latest price changes" meta="Across all tracked stores">
          <Body loading={isPending} error={isError} empty={data?.latestChanges.length === 0}>
            <ChangesTable changes={data?.latestChanges ?? []} />
          </Body>
        </Panel>

        <Panel title="Recent releases" meta="Newest tracked games">
          <Body loading={isPending} error={isError} empty={data?.newReleases.length === 0}>
            <ReleasesTable games={data?.newReleases ?? []} />
          </Body>
        </Panel>
      </div>
    </>
  );
}

function Body({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean | undefined;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="space-y-px" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2">
            <div className="h-[34px] w-[73px] animate-pulse rounded-sm bg-surface-2" />
            <div className="h-3 w-1/2 animate-pulse rounded-sm bg-surface-2" />
          </div>
        ))}
      </div>
    );
  }
  if (error) return <p className="px-3 py-4 text-[13px] text-rise">Couldn't load this section.</p>;
  if (empty) return <p className="px-3 py-4 text-[13px] text-muted">Nothing here right now.</p>;
  return <>{children}</>;
}

const ROW = "relative border-b border-line/60 last:border-0 hover:bg-surface-2/60";

function DealTable({ games, showAtl = false }: { games: GameSummary[]; showAtl?: boolean }) {
  return (
    <table className="w-full table-fixed">
      <thead>
        <tr className="border-b border-line">
          <th className={TH}>Game</th>
          <th className={`${TH} w-20 text-right`}>Discount</th>
          <th className={`${TH} w-24 text-right`}>Price</th>
        </tr>
      </thead>
      <tbody>
        {games.map((g) => (
          <tr key={g.slug} className={ROW}>
            <td className="px-3 py-1.5">
              <GameCell
                {...g}
                sub={
                  <>
                    <StoreLabel storeId={g.bestDeal!.storeId} />
                    {showAtl && <AtlBadge short />}
                  </>
                }
              />
            </td>
            <td className="px-3 py-1.5 text-right">
              <DiscountBadge cut={g.bestDeal!.cut} />
            </td>
            <td className="px-3 py-1.5 text-right font-mono">
              <div className="text-[11px] text-faint line-through">{formatCents(g.bestDeal!.regularCents)}</div>
              <div className="font-semibold">{formatCents(g.bestDeal!.priceCents)}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UpcomingTable({ sales }: { sales: UpcomingSale[] }) {
  const now = Date.now();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] table-fixed">
        <thead>
          <tr className="border-b border-line">
            <th className={TH}>Game</th>
            <th className={`${TH} w-36`}>Expected</th>
            <th className={`${TH} w-20 text-right`}>Chance</th>
            <th className={`${TH} w-20 text-right`}>Typical</th>
            <th className={`${TH} w-28 text-right`}>Est. price</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => {
            const days = Math.max(1, Math.round((Date.parse(s.expectedStart) - now) / 86_400_000));
            return (
              <tr key={s.game.slug} className={ROW}>
                <td className="px-3 py-1.5">
                  <GameCell {...s.game} sub={<span className="truncate">{s.label}</span>} />
                </td>
                <td className="px-3 py-1.5 font-mono text-[13px]">
                  <div>{formatDate(s.expectedStart)}</div>
                  <div className="text-[11px] text-faint">in {days} day{days === 1 ? "" : "s"}</div>
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[13px] text-muted">
                  {s.chance !== null ? `${Math.round(s.chance * 100)}%` : "—"}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {s.typicalCut !== null ? <DiscountBadge cut={s.typicalCut} /> : "—"}
                </td>
                <td className="px-3 py-1.5 text-right font-mono">
                  {s.game.bestDeal && (
                    <div className="text-[11px] text-faint line-through">{formatCents(s.game.bestDeal.priceCents)}</div>
                  )}
                  <div className="font-semibold text-deal">
                    {s.expectedPriceCents !== null ? `~${formatCents(s.expectedPriceCents)}` : "—"}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChangesTable({ changes }: { changes: PriceChange[] }) {
  return (
    <table className="w-full table-fixed">
      <thead>
        <tr className="border-b border-line">
          <th className={TH}>Game</th>
          <th className={`${TH} w-40 text-right`}>Change</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c) => {
          const dropped = c.priceCents < c.previousCents;
          return (
            <tr key={`${c.game.slug}-${c.storeId}-${c.timestamp}`} className={ROW}>
              <td className="px-3 py-1.5">
                <GameCell
                  {...c.game}
                  sub={
                    <>
                      <StoreLabel storeId={c.storeId} />
                      <span className="text-faint">{formatRelative(c.timestamp)}</span>
                    </>
                  }
                />
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-[13px]">
                <span className="text-faint">{formatCents(c.previousCents)} → </span>
                <span className={`font-semibold ${dropped ? "text-deal" : "text-rise"}`}>{formatCents(c.priceCents)}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ReleasesTable({ games }: { games: GameSummary[] }) {
  return (
    <table className="w-full table-fixed">
      <thead>
        <tr className="border-b border-line">
          <th className={TH}>Game</th>
          <th className={`${TH} w-32 text-right`}>Released</th>
          <th className={`${TH} w-24 text-right`}>Price</th>
        </tr>
      </thead>
      <tbody>
        {games.map((g) => (
          <tr key={g.slug} className={ROW}>
            <td className="px-3 py-1.5">
              <GameCell {...g} />
            </td>
            <td className="px-3 py-1.5 text-right font-mono text-[13px] text-muted">
              {g.releaseDate ? formatDate(g.releaseDate) : "—"}
            </td>
            <td className="px-3 py-1.5 text-right font-mono">
              {g.bestDeal ? (
                <span className="flex items-center justify-end gap-1.5">
                  <DiscountBadge cut={g.bestDeal.cut} />
                  <span className="font-semibold">{formatCents(g.bestDeal.priceCents)}</span>
                </span>
              ) : (
                "—"
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
