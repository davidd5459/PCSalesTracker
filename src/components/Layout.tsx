import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { USING_SAMPLE_DATA } from "../api/catalog";
import { Logo } from "./Logo";
import { SearchBar } from "./SearchBar";

export function Layout() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  // Block body on purpose: an effect must not return anything but a cleanup function.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-4 px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-tight">
            <Logo className="size-7" />
            PCSalesTracker
          </Link>
          {USING_SAMPLE_DATA && (
            <span
              className="hidden rounded-sm border border-atl/40 px-1.5 font-mono text-[10px] uppercase leading-4 text-atl sm:inline"
              title="Prices are generated sample data until the live data source is connected"
            >
              Sample data
            </span>
          )}
          {!isHome && (
            <div className="ml-auto w-full max-w-xs">
              <SearchBar size="sm" />
            </div>
          )}
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-12 border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-faint sm:flex-row sm:justify-between">
          <p>
            PCSalesTracker is an independent project, not affiliated with any store or with IsThereAnyDeal.{" "}
            {USING_SAMPLE_DATA ? (
              "Prices currently shown are generated sample data."
            ) : (
              <>
                Price data from the{" "}
                <a href="https://isthereanydeal.com" target="_blank" rel="noopener noreferrer" className="text-muted underline hover:text-ink">
                  IsThereAnyDeal API
                </a>
                .
              </>
            )}
          </p>
          <p>© {new Date().getFullYear()} PCSalesTracker · MIT License</p>
        </div>
      </footer>
    </div>
  );
}
