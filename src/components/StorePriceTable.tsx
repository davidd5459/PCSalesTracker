import { ExternalLink } from "lucide-react";
import { compareStores } from "../config/stores";
import { formatCents, formatDate } from "../lib/format";
import { currentDeals, listingLow } from "../lib/priceStats";
import type { StoreListing } from "../types";
import { DiscountBadge, StoreLabel } from "./Badges";
import { TH } from "./Panel";

/** Current price at each store, cheapest first. */
export function StorePriceTable({ listings }: { listings: StoreListing[] }) {
  const deals = currentDeals(listings);
  const lowest = deals[0]?.priceCents;
  const lowByStore = new Map(listings.map((l) => [l.storeId, listingLow(l)?.priceCents]));
  const delisted = listings.filter((l) => !l.available).sort((a, b) => compareStores(a.storeId, b.storeId));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px]">
        <thead>
          <tr className="border-b border-line">
            <th className={TH}>Store</th>
            <th className={`${TH} text-right`}>Discount</th>
            <th className={`${TH} text-right`}>Regular</th>
            <th className={`${TH} text-right`}>Store low</th>
            <th className={`${TH} text-right`}>Price</th>
            <th className={TH}>
              <span className="sr-only">Store link</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {deals.map((deal) => {
            const isBest = deal.priceCents === lowest;
            const storeLow = lowByStore.get(deal.storeId);
            return (
              <tr key={deal.storeId} className="border-b border-line/60 last:border-0 hover:bg-surface-2/60">
                <td className="px-3 py-2 font-medium">
                  <StoreLabel storeId={deal.storeId} />
                </td>
                <td className="px-3 py-2 text-right">
                  <DiscountBadge cut={deal.cut} />
                </td>
                <td className={`px-3 py-2 text-right font-mono text-[13px] text-faint ${deal.cut > 0 ? "line-through" : ""}`}>
                  {formatCents(deal.regularCents)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-[13px] text-muted">
                  {storeLow !== undefined ? formatCents(storeLow) : "—"}
                </td>
                <td className={`px-3 py-2 text-right font-mono font-semibold ${isBest ? "text-deal" : ""}`}>
                  {formatCents(deal.priceCents)}
                </td>
                <td className="px-3 py-2 text-right">
                  {deal.url ? (
                    <a
                      href={deal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      Store <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : (
                    <span className="text-xs text-faint" title="Store links arrive with live data">
                      —
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {delisted.map((listing) => {
            const last = listing.history.at(-1);
            const storeLow = lowByStore.get(listing.storeId);
            return (
              <tr key={listing.storeId} className="border-b border-line/60 text-faint last:border-0">
                <td className="px-3 py-2">
                  <StoreLabel storeId={listing.storeId} className="opacity-60" />
                </td>
                <td colSpan={2} className="px-3 py-2 text-right text-xs">
                  No longer sold{last && <> · last seen {formatDate(last.timestamp)}</>}
                </td>
                <td className="px-3 py-2 text-right font-mono text-[13px]">
                  {storeLow !== undefined ? formatCents(storeLow) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono">—</td>
                <td />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
