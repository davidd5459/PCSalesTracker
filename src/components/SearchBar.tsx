import { LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { useSearch } from "../api/queries";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { formatCents } from "../lib/format";
import { DiscountBadge, TypeBadge } from "./Badges";
import { CoverImage } from "./CoverImage";

interface Props {
  size?: "lg" | "sm";
  autoFocus?: boolean;
}

/** Search box with a keyboard-navigable autocomplete list (ARIA combobox pattern). */
export function SearchBar({ size = "lg", autoFocus = false }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounced = useDebouncedValue(query, 200);
  const { data: results = [], isFetching } = useSearch(debounced);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const hasQuery = debounced.trim().length >= 2;
  const showList = open && hasQuery;

  useEffect(() => {
    setActiveIndex(-1);
  }, [debounced]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const goTo = (slug: string) => {
    setOpen(false);
    setQuery("");
    navigate(`/game/${slug}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      const target = results[activeIndex] ?? results[0];
      if (showList && target) goTo(target.slug);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const isLarge = size === "lg";

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={`flex items-center gap-2.5 rounded border border-line bg-bg px-3 focus-within:border-accent ${
          isLarge ? "h-11" : "h-8"
        }`}
      >
        <Search className={`shrink-0 text-faint ${isLarge ? "size-4.5" : "size-3.5"}`} aria-hidden />
        <input
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-label="Search PC games"
          placeholder={isLarge ? "Search for a game or DLC…" : "Search games…"}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint ${isLarge ? "text-[15px]" : "text-[13px]"}`}
        />
        {isFetching && hasQuery && <LoaderCircle className="size-3.5 shrink-0 animate-spin text-faint" aria-hidden />}
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="rounded-sm p-0.5 text-faint hover:text-ink"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-[min(70vh,26rem)] overflow-y-auto rounded border border-line bg-surface py-1 shadow-xl shadow-black/60"
        >
          {results.length === 0 && !isFetching && (
            <li className="px-3 py-3 text-[13px] text-muted">No games match “{debounced.trim()}”.</li>
          )}
          {results.map((game, i) => (
            <li
              key={game.slug}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => goTo(game.slug)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex cursor-pointer items-center gap-3 px-2.5 py-1.5 ${i === activeIndex ? "bg-surface-2" : ""}`}
            >
              <CoverImage src={game.coverUrl} title={game.title} compact className="h-[30px] w-[64px] shrink-0 rounded-sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{game.title}</div>
                <div className="flex items-center gap-2 text-xs text-faint">
                  <TypeBadge type={game.type} />
                  {game.releaseDate && <span className="font-mono">{game.releaseDate.slice(0, 4)}</span>}
                </div>
              </div>
              {game.bestDeal && (
                <div className="flex shrink-0 items-center gap-2">
                  <DiscountBadge cut={game.bestDeal.cut} />
                  <span className="font-mono text-[13px] font-medium">{formatCents(game.bestDeal.priceCents)}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
