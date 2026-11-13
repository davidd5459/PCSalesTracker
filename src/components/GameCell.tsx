import type { ReactNode } from "react";
import { Link } from "react-router";
import type { GameType } from "../types";
import { TypeBadge } from "./Badges";
import { CoverImage } from "./CoverImage";

interface Props {
  slug: string;
  title: string;
  type: GameType;
  coverUrl: string | null;
  /** Secondary line under the title (store, date, etc.). */
  sub?: ReactNode;
}

/**
 * Thumbnail + title for a table row. The link stretches over the whole row
 * (via `after:inset-0`), so place it inside a `<tr className="relative">`.
 */
export function GameCell({ slug, title, type, coverUrl, sub }: Props) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <CoverImage src={coverUrl} title={title} compact className="h-[34px] w-[73px] shrink-0 rounded-sm" />
      <div className="min-w-0">
        <Link
          to={`/game/${slug}`}
          className="block truncate font-medium text-ink after:absolute after:inset-0 hover:text-accent focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-accent"
        >
          {title}
        </Link>
        {(sub || type === "dlc") && (
          <div className="flex items-center gap-2 text-xs text-muted">
            {type === "dlc" && <TypeBadge type="dlc" />}
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
