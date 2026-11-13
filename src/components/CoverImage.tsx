import { useState } from "react";

interface Props {
  src: string | null;
  title: string;
  className?: string;
  /** Small thumbnails skip the title text in the fallback. */
  compact?: boolean;
}

/** Game cover with a plain fallback when the image is missing or fails to load. */
export function CoverImage({ src, title, className = "", compact = false }: Props) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-surface-2 p-2 text-center text-xs font-medium text-faint ${className}`}
        role="img"
        aria-label={title}
      >
        {!compact && <span className="line-clamp-2">{title}</span>}
      </div>
    );
  }

  return (
    <img src={src} alt={compact ? "" : title} loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className}`} />
  );
}
