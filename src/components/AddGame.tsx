import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { catalog } from "../api/catalog";

/**
 * Shown for /game/:slug?add=<itadId> when the game isn't tracked yet: imports
 * its price history, then swaps in the real game page.
 */
export function AddGame({ slug, itadId }: { slug: string; itadId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const started = useRef(false);

  const add = useMutation({
    mutationFn: () => catalog.importGame(itadId),
    onSuccess: async (newSlug) => {
      // The game now exists: drop cached "not found" results and lists that should include it.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["game", newSlug] }),
        queryClient.invalidateQueries({ queryKey: ["search"] }),
        queryClient.invalidateQueries({ queryKey: ["search-external"] }),
        queryClient.invalidateQueries({ queryKey: ["home"] }),
      ]);
      navigate(`/game/${newSlug}`, { replace: true });
    },
  });

  useEffect(() => {
    // Guard against React's development double-run so we only import once.
    if (started.current) return;
    started.current = true;
    add.mutate();
  }, [add]);

  const title = slug.replace(/-/g, " ");

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      {add.isError ? (
        <>
          <h1 className="text-lg font-semibold">Couldn't add this game</h1>
          <p className="mt-2 text-sm text-muted">{(add.error as Error).message}</p>
          <div className="mt-5 flex justify-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => add.mutate()}
              className="rounded border border-line px-3 py-1.5 hover:border-accent hover:text-accent"
            >
              Try again
            </button>
            <Link to="/" className="rounded px-3 py-1.5 text-muted hover:text-ink">
              Back to home
            </Link>
          </div>
        </>
      ) : (
        <div role="status" aria-live="polite">
          <LoaderCircle className="mx-auto size-6 animate-spin text-accent" aria-hidden />
          <h1 className="mt-4 text-lg font-semibold capitalize">Adding {title}</h1>
          <p className="mt-2 text-sm text-muted">Getting its price history. This takes a few seconds.</p>
        </div>
      )}
    </div>
  );
}
