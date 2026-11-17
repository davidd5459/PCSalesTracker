import { getStore } from "../config/stores";
import { likelihood, type Likelihood } from "../lib/salePrediction";
import type { GameType } from "../types";

export function DiscountBadge({ cut, className = "" }: { cut: number; className?: string }) {
  if (cut <= 0) return null;
  return (
    <span className={`rounded-sm bg-deal/15 px-1 py-px font-mono text-xs font-semibold text-deal ${className}`}>
      -{cut}%
    </span>
  );
}

/** Marks a price that matches or beats the lowest ever recorded. */
export function AtlBadge({ short = false, className = "" }: { short?: boolean; className?: string }) {
  return (
    <span
      className={`rounded-sm border border-atl/50 bg-atl/10 px-1 py-px text-[11px] font-semibold uppercase tracking-wide text-atl ${className}`}
      title="Matches or beats the lowest price ever recorded"
    >
      {short ? "ATL" : "All-time low"}
    </span>
  );
}

export function TypeBadge({ type }: { type: GameType }) {
  const isDlc = type === "dlc";
  return (
    <span
      className={`rounded-sm border px-1 text-[10px] font-semibold uppercase leading-4 tracking-wider ${
        isDlc ? "border-violet-400/40 text-violet-300" : "border-line text-muted"
      }`}
    >
      {isDlc ? "DLC" : "Game"}
    </span>
  );
}

export function StoreLabel({ storeId, className = "" }: { storeId: string; className?: string }) {
  const store = getStore(storeId);
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: store.color }} aria-hidden />
      {store.name}
    </span>
  );
}

const LIKELIHOOD_STYLE: Record<Likelihood, { label: string; tone: string; hint: string }> = {
  high: { label: "High", tone: "border-deal/50 text-deal", hint: "On sale during this event in most recent years" },
  moderate: { label: "Moderate", tone: "border-accent/50 text-accent", hint: "On sale during this event in about half of recent years" },
  low: { label: "Low", tone: "border-line text-faint", hint: "Rarely on sale during this event" },
};

/** Chance of a sale as Low / Moderate / High, from a 0–1 forecast score. */
export function LikelihoodBadge({ chance }: { chance: number }) {
  const style = LIKELIHOOD_STYLE[likelihood(chance)];
  return (
    <span
      className={`inline-block rounded-sm border px-1.5 text-[11px] font-medium leading-4 ${style.tone}`}
      title={style.hint}
    >
      {style.label}
    </span>
  );
}
