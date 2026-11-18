import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useGame } from "../api/queries";
import { AddGame } from "../components/AddGame";
import { ChevronRight } from "lucide-react";
import { DiscountBadge, StoreLabel, TypeBadge } from "../components/Badges";
import { CoverImage } from "../components/CoverImage";
import { Panel } from "../components/Panel";
import { PriceHistoryChart } from "../components/PriceHistoryChart";
import { PriceLog } from "../components/PriceLog";
import { SaleVerdict, UpcomingSalesPanel } from "../components/SaleForecastPanel";
import { ShopFilter } from "../components/ShopFilter";
import { StorePriceTable } from "../components/StorePriceTable";
import { compareStores } from "../config/stores";
import { formatCents, formatDate } from "../lib/format";
import { summarize } from "../lib/priceStats";
import { forecastSales, saleCalendar } from "../lib/salePrediction";
import type { GameDetail } from "../types";
import { NotFoundPage } from "./NotFoundPage";

export function GamePage() {
  const { slug = "" } = useParams();
  const { data: game, isPending, isError } = useGame(slug);
  // Set when arriving from a "not tracked yet" search result.
  const addId = useSearchParams()[0].get("add");

  useEffect(() => {
    if (game) document.title = `${game.title} · Price history · PCSalesTracker`;
  }, [game]);

  if (isPending) return <GamePageSkeleton />;
  if (isError) {
    return <p className="mx-auto max-w-[1400px] px-4 py-16 text-rise">Couldn't load this game. Please try again.</p>;
  }
  if (!game) {
    return addId ? <AddGame slug={slug} itadId={addId} /> : <NotFoundPage message="We couldn't find that game." />;
  }
  // Keyed by slug so filters reset when navigating between games.
  return <GameView key={game.slug} game={game} />;
}

function GameView({ game }: { game: GameDetail }) {
  const summary = useMemo(() => summarize(game), [game]);
  const { bestDeal, historicalLow } = summary;
  const storeIds = useMemo(() => game.listings.map((l) => l.storeId).sort(compareStores), [game]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const { forecast, calendar } = useMemo(() => {
    const now = Date.now();
    return { forecast: forecastSales(game.listings, now), calendar: saleCalendar(game.listings, now) };
  }, [game]);

  const toggleStore = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-5">
      <nav className="text-sm text-faint" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-ink">
          Home
        </Link>
        <span className="mx-1.5">/</span>
        {game.baseGame && (
          <>
            <Link to={`/game/${game.baseGame.slug}`} className="hover:text-ink">
              {game.baseGame.title}
            </Link>
            <span className="mx-1.5">/</span>
          </>
        )}
        <span className="text-muted">{game.title}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold">{game.title}</h1>
        {game.type === "dlc" && <TypeBadge type="dlc" />}
      </div>

      {forecast && (
        <div className="mt-4">
          <SaleVerdict forecast={forecast} />
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Price history" meta={<ShopFilter storeIds={storeIds} hidden={hidden} onToggle={toggleStore} />}>
            <PriceHistoryChart listings={game.listings} historicalLow={historicalLow} hidden={hidden} />
          </Panel>

          <Panel title="Current prices">
            <StorePriceTable listings={game.listings} />
          </Panel>

          {forecast && <UpcomingSalesPanel forecast={forecast} calendar={calendar} />}

          <details className="group rounded border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 text-muted transition-transform group-open:rotate-90" aria-hidden />
              Price change log
            </summary>
            <div className="border-t border-line">
              <PriceLog listings={game.listings} hidden={hidden} />
            </div>
          </details>
        </div>

        <aside className="order-first space-y-5 lg:order-none">
          <div className="overflow-hidden rounded border border-line bg-surface">
            <CoverImage src={game.coverUrl} title={game.title} className="aspect-[460/215] w-full" />
            <dl className="divide-y divide-line/60 text-sm">
              <InfoRow label="Best price">
                {bestDeal ? (
                  <span className="flex items-center justify-end gap-2">
                    <DiscountBadge cut={bestDeal.cut} />
                    <span className="text-base font-semibold text-deal">{formatCents(bestDeal.priceCents)}</span>
                  </span>
                ) : (
                  "Not sold"
                )}
              </InfoRow>
              {bestDeal && (
                <InfoRow label="At">
                  <StoreLabel storeId={bestDeal.storeId} />
                </InfoRow>
              )}
              {bestDeal && <InfoRow label="Regular price">{formatCents(bestDeal.regularCents)}</InfoRow>}
              {historicalLow && (
                <InfoRow label="Lowest ever">
                  <span className="font-semibold text-atl">{formatCents(historicalLow.priceCents)}</span>
                  <div className="text-xs text-faint">{formatDate(historicalLow.timestamp)}</div>
                </InfoRow>
              )}
            </dl>
          </div>

          <div className="rounded border border-line bg-surface">
            <dl className="divide-y divide-line/60 text-sm">
              {game.baseGame && (
                <InfoRow label="DLC for">
                  <Link to={`/game/${game.baseGame.slug}`} className="text-accent hover:underline">
                    {game.baseGame.title}
                  </Link>
                </InfoRow>
              )}
              {game.developer && <InfoRow label="Developer">{game.developer}</InfoRow>}
              {game.releaseDate && <InfoRow label="Released">{formatDate(game.releaseDate)}</InfoRow>}
              {game.sourceUrl && (
                <InfoRow label="Price data">
                  <a href={game.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    IsThereAnyDeal ↗
                  </a>
                </InfoRow>
              )}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function GamePageSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] animate-pulse px-4 pt-5" aria-busy="true" aria-label="Loading">
      <div className="h-3 w-40 rounded-sm bg-surface-2" />
      <div className="mt-3 h-7 w-72 rounded-sm bg-surface-2" />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <div className="h-48 rounded border border-line bg-surface" />
          <div className="h-[380px] rounded border border-line bg-surface" />
        </div>
        <div className="order-first h-72 rounded border border-line bg-surface lg:order-none" />
      </div>
    </div>
  );
}
