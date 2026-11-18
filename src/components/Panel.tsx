import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  /** Right-aligned text or controls in the header bar. */
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Bordered section with a header bar; the basic building block of every page. */
export function Panel({ title, meta, children, className = "" }: Props) {
  return (
    <section className={`overflow-hidden rounded border border-line bg-surface ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-3 py-2.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {meta && <div className="text-sm text-muted">{meta}</div>}
      </header>
      {children}
    </section>
  );
}

/** Shared column-header styling for data tables. */
export const TH = "px-3 py-2 text-left text-xs font-medium text-muted";
