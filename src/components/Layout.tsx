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
        <div className="mx-auto flex h-12 max-w-[1400px] items-center gap-4 px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2 text-[15px] font-semibold">
            <Logo className="size-7" />
            PCSalesTracker
          </Link>
          {USING_SAMPLE_DATA && (
            <span
              className="hidden rounded-sm border border-atl/40 px-1.5 text-xs leading-4 text-atl sm:inline"
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
        <p className="mx-auto max-w-[1400px] px-4 py-6 text-sm text-faint">
          {USING_SAMPLE_DATA ? (
            "Showing generated sample prices."
          ) : (
            <>
              Price data from{" "}
              <a href="https://isthereanydeal.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                IsThereAnyDeal
              </a>
              .
            </>
          )}{" "}
          Not affiliated with any store.
        </p>
      </footer>
    </div>
  );
}
