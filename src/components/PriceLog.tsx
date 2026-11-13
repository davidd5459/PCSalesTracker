import { useMemo, useState } from "react";
import { formatCents, formatDate } from "../lib/format";
import { priceLog } from "../lib/priceStats";
import type { StoreListing } from "../types";
import { StoreLabel } from "./Badges";
import { TH } from "./Panel";

const PAGE_SIZE = 25;
const DAY = 86_400_000;

/** Every recorded price change, newest first. */
export function PriceLog({ listings, hidden }: { listings: StoreListing[]; hidden: Set<string> }) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const entries = useMemo(() => priceLog(listings).filter((e) => !hidden.has(e.storeId)), [listings, hidden]);
  const shown = entries.slice(0, limit);

  if (entries.length === 0) return <p className="px-3 py-4 text-[13px] text-muted">No price changes to show.</p>;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-line">
              <th className={TH}>Date</th>
              <th className={TH}>Store</th>
              <th className={TH}>Held for</th>
              <th className={`${TH} text-right`}>Discount</th>
              <th className={`${TH} text-right`}>Regular</th>
              <th className={`${TH} text-right`}>Price</th>
            </tr>
          </thead>
          <tbody className="font-mono text-[13px]">
            {shown.map((e) => {
              const delta = e.previous ? e.priceCents - e.previous.priceCents : 0;
              const heldDays = e.previous
                ? Math.round((Date.parse(e.timestamp) - Date.parse(e.previous.timestamp)) / DAY)
                : null;
              return (
                <tr key={`${e.storeId}-${e.timestamp}`} className="border-b border-line/60 last:border-0 hover:bg-surface-2/60">
                  <td className="whitespace-nowrap px-3 py-1.5 text-muted">{formatDate(e.timestamp)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-sans">
                    <StoreLabel storeId={e.storeId} />
                  </td>
                  <td className="px-3 py-1.5 text-faint" title="How long the previous price lasted">
                    {heldDays === null ? <span className="font-sans">First seen</span> : `${heldDays}d`}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    {e.previous && <span className="text-faint">{e.previous.cut}% → </span>}
                    <span className={e.cut > 0 ? "text-deal" : "text-muted"}>{e.cut}%</span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted">{formatCents(e.regularCents)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <span className="font-medium">{formatCents(e.priceCents)}</span>
                    {delta !== 0 && (
                      <span className={`ml-2 text-xs ${delta < 0 ? "text-deal" : "text-rise"}`}>
                        {delta < 0 ? "−" : "+"}
                        {formatCents(Math.abs(delta))}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {limit < entries.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE_SIZE * 2)}
          className="w-full border-t border-line py-2 text-[13px] text-accent hover:bg-surface-2"
        >
          Show more ({entries.length - limit} remaining)
        </button>
      )}
    </>
  );
}
