import { getStore } from "../config/stores";

interface Props {
  storeIds: string[];
  hidden: Set<string>;
  onToggle: (storeId: string) => void;
}

/** Store toggles shared by the price chart and the price change log. */
export function ShopFilter({ storeIds, hidden, onToggle }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter stores">
      {storeIds.map((id) => {
        const store = getStore(id);
        const on = !hidden.has(id);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(id)}
            className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs transition-colors ${
              on ? "border-line bg-surface-2 text-ink" : "border-transparent text-faint line-through"
            }`}
          >
            <span
              className="size-2 rounded-[2px]"
              style={{ backgroundColor: on ? store.color : "transparent", outline: `1px solid ${store.color}` }}
              aria-hidden
            />
            {store.name}
          </button>
        );
      })}
    </div>
  );
}
