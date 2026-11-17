import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useGame } from "../api/queries";
import { AddGame } from "../components/AddGame";
import { AtlBadge, DiscountBadge, StoreLabel, TypeBadge } from "../components/Badges";
import { CoverImage } from "../components/CoverImage";
import { Panel } from "../components/Panel";
import { PriceHistoryChart } from "../components/PriceHistoryChart";
import { PriceLog } from "../components/PriceLog";
import { SaleForecastPanel } from "../components/SaleForecastPanel";
import { ShopFilter } from "../components/ShopFilter";
import { StorePriceTable } from "../components/StorePriceTable";
import { compareStores } from "../config/stores";
import { formatCents, formatDate, formatInteger } from "../lib/format";
import { summarize } from "../lib/priceStats";
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
    return <p className="mx-auto max-w-6xl px-4 py-16 text-rise">Couldn't load this game. Please try again.</p>;
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

  const stats = useMemo(() => {
    const timestamps = game.listings.flatMap((l) => l.history.map((p) => p.timestamp)).sort();
    return { trackedSince: timestamps[0], changes: timestamps.length };
  }, [game]);

  const toggleStore = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onSaleAtLow = summary.isAtHistoricalLow && bestDeal && bestDeal.cut > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-5">
      <nav className="text-xs text-faint" aria-label="Breadcrumb">
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
        <h1 className="text-2xl font-semibold tracking-tight">{game.title}</h1>
        <TypeBadge type={game.type} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {onSaleAtLow && (
            <div className="flex items-center gap-2 rounded border border-atl/40 bg-atl/5 px-3 py-2 text-[13px]">
              <AtlBadge />
              <span>
                {formatCents(bestDeal.priceCents)} at <StoreLabel storeId={bestDeal.storeId} /> is the lowest price
                ever recorded for this game.
              </span>
            </div>
          )}

          <SaleForecastPanel listings={game.listings} />

          <Panel title="Current prices" meta={storesMeta(game)}>
            <StorePriceTable listings={game.listings} />
          </Panel>

          <Panel title="Price history" meta={<ShopFilter storeIds={storeIds} hidden={hidden} onToggle={toggleStore} />}>
            <PriceHistoryChart listings={game.listings} historicalLow={historicalLow} hidden={hidden} />
          </Panel>

          <Panel title="Price change log" meta="Store filter above applies here too">
            <PriceLog listings={game.listings} hidden={hidden} />
          </Panel>
        </div>

        <aside className="order-first space-y-4 lg:order-none">
          <div className="overflow-hidden rounded border border-line bg-surface">
            <CoverImage src={game.coverUrl} title={game.title} className="aspect-[460/215] w-full" />
            <dl className="divide-y divide-line/60 text-[13px]">
              <InfoRow label="Best price">
                {bestDeal ? (
                  <span className="flex items-center justify-end gap-2">
                    <DiscountBadge cut={bestDeal.cut} />
                    <span className="font-mono text-[15px] font-semibold text-deal">{formatCents(bestDeal.priceCents)}</span>
                  </span>
                ) : (
                  "—"
                )}
              </InfoRow>
              {bestDeal && (
                <InfoRow label="At">
                  <StoreLabel storeId={bestDeal.storeId} />
                </InfoRow>
              )}
              <InfoRow label="All-time low">
                {historicalLow ? (
                  <span className="font-mono font-semibold text-atl">{formatCents(historicalLow.priceCents)}</span>
                ) : (
                  "—"
                )}
              </InfoRow>
              {historicalLow && (
                <InfoRow label="Low last seen">
                  <span className="font-mono">{formatDate(historicalLow.timestamp)}</span>
                </InfoRow>
              )}
              <InfoRow label="Regular price">
                <span className="font-mono">{bestDeal ? formatCents(bestDeal.regularCents) : "—"}</span>
              </InfoRow>
            </dl>
          </div>

          <div className="rounded border border-line bg-surface">
            <dl className="divide-y divide-line/60 text-[13px]">
              <InfoRow label="Type">{game.type === "dlc" ? "DLC" : "Game"}</InfoRow>
              {game.baseGame && (
                <InfoRow label="DLC for">
                  <Link to={`/game/${game.baseGame.slug}`} className="text-accent hover:underline">
                    {game.baseGame.title}
                  </Link>
                </InfoRow>
              )}
              {game.developer && <InfoRow label="Developer">{game.developer}</InfoRow>}
              {game.releaseDate && (
                <InfoRow label="Released">
                  <span className="font-mono">{formatDate(game.releaseDate)}</span>
                </InfoRow>
              )}
              {stats.trackedSince && (
                <InfoRow label="Tracked since">
                  <span className="font-mono">{formatDate(stats.trackedSince)}</span>
                </InfoRow>
              )}
              <InfoRow label="Price changes">
                <span className="font-mono">{formatInteger(stats.changes)}</span>
              </InfoRow>
              {game.sourceUrl && (
                <InfoRow label="Data source">
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

function storesMeta(game: GameDetail): string {
  const selling = game.listings.filter((l) => l.available).length;
  const total = game.listings.length;
  return selling === total ? `${total} stores` : `${selling} of ${total} stores selling`;
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
    <div className="mx-auto max-w-6xl animate-pulse px-4 pt-5" aria-busy="true" aria-label="Loading">
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
