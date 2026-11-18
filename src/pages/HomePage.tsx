import { useEffect, type ReactNode } from "react";
import { useHomeSections } from "../api/queries";
import { DiscountBadge, LikelihoodBadge, StoreLabel } from "../components/Badges";
import { GameCell } from "../components/GameCell";
import { Panel, TH } from "../components/Panel";
import { SearchBar } from "../components/SearchBar";
import { daysUntil, formatCents, formatDate, formatDaysUntil, formatInteger } from "../lib/format";
import type { GameSummary, HomeSections, UpcomingSale } from "../types";

export function HomePage() {
  const { data, isPending, isError } = useHomeSections();

  useEffect(() => {
    document.title = "PCSalesTracker · PC game price history";
  }, []);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 pt-6">
      <div className="max-w-2xl">
        <h1 className="mb-2 text-lg font-semibold">Look up a PC game</h1>
        <SearchBar size="lg" autoFocus />
      </div>

      {data && <NextSaleBanner data={data} />}

      <Panel title="Sales expected soon">
        <Body loading={isPending} error={isError} empty={data?.upcomingSales.length === 0}>
          <UpcomingTable sales={data?.upcomingSales ?? []} />
        </Body>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Biggest discounts">
          <Body loading={isPending} error={isError} empty={data?.biggestSales.length === 0}>
            <DealTable games={data?.biggestSales ?? []} />
          </Body>
        </Panel>

        <Panel title="At their lowest price ever">
          <Body loading={isPending} error={isError} empty={data?.atHistoricalLow.length === 0}>
            <DealTable games={data?.atHistoricalLow ?? []} />
          </Body>
        </Panel>
      </div>
    </div>
  );
}

/** The next sale season most games are expected to join, and how far away it is. */
function NextSaleBanner({ data }: { data: HomeSections }) {
  const sale = data.nextMajorSale;
  const onSale = data.stats.onSale > 0 && (
    <p className="text-sm text-muted">
      Right now, {formatInteger(data.stats.onSale)} of the {formatInteger(data.stats.games)} games we track are on sale.
    </p>
  );
  if (!sale) return onSale ? <div className="rounded border border-line bg-surface px-4 py-3">{onSale}</div> : null;

  const days = daysUntil(sale.expectedStart);
  return (
    <section className="flex flex-col gap-4 rounded border border-l-4 border-line border-l-atl bg-surface px-5 py-4 sm:flex-row sm:items-center">
      <div className="shrink-0 text-center sm:w-28">
        <div className="text-4xl font-bold leading-none text-atl">{days}</div>
        <div className="mt-1 text-sm text-muted">{days === 1 ? "day" : "days"} to go</div>
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">
          Next big sale: {sale.label}, around {formatDate(sale.expectedStart)}
        </h2>
        <p className="text-[15px]">
          {formatInteger(sale.games)} games we track are likely to be discounted
          {sale.typicalCut !== null && <>, usually by about {sale.typicalCut}%</>}.
        </p>
        {onSale}
      </div>
    </section>
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
  if (error) return <p className="px-3 py-4 text-sm text-rise">Couldn't load this section.</p>;
  if (empty) return <p className="px-3 py-4 text-sm text-muted">Nothing here right now.</p>;
  return <>{children}</>;
}

const ROW = "relative border-b border-line/60 last:border-0 hover:bg-surface-2/60";

function UpcomingTable({ sales }: { sales: UpcomingSale[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr className="border-b border-line">
            <th className={TH}>Game</th>
            <th className={TH}>Sale</th>
            <th className={TH}>Expected</th>
            <th className={TH}>Chance</th>
            <th className={`${TH} text-right`}>Usually</th>
            <th className={`${TH} text-right`}>Price then</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr key={s.game.slug} className={ROW}>
              <td className="px-3 py-1.5">
                <GameCell {...s.game} />
              </td>
              <td className="px-3 py-1.5 text-sm">{s.label}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-sm">
                {formatDate(s.expectedStart)}
                <span className="ml-1.5 text-muted">({formatDaysUntil(s.expectedStart)})</span>
              </td>
              <td className="px-3 py-1.5">
                {s.chance !== null ? <LikelihoodBadge chance={s.chance} /> : <span className="text-faint">—</span>}
              </td>
              <td className="px-3 py-1.5 text-right">
                {s.typicalCut !== null ? <DiscountBadge cut={s.typicalCut} /> : "—"}
              </td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right">
                {s.game.bestDeal && (
                  <span className="mr-2 text-sm text-faint line-through">{formatCents(s.game.bestDeal.priceCents)}</span>
                )}
                <span className="font-semibold text-deal">
                  {s.expectedPriceCents !== null ? `~${formatCents(s.expectedPriceCents)}` : "—"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DealTable({ games }: { games: GameSummary[] }) {
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
              <GameCell {...g} sub={<StoreLabel storeId={g.bestDeal!.storeId} />} />
            </td>
            <td className="px-3 py-1.5 text-right">
              <DiscountBadge cut={g.bestDeal!.cut} />
            </td>
            <td className="px-3 py-1.5 text-right">
              <div className="text-xs text-faint line-through">{formatCents(g.bestDeal!.regularCents)}</div>
              <div className="font-semibold">{formatCents(g.bestDeal!.priceCents)}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
