import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { catalog } from "./catalog";

export function useSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["search", trimmed.toLowerCase()],
    queryFn: () => catalog.search(trimmed),
    enabled: trimmed.length >= 2,
    // Keep showing the previous results while the next query loads.
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

/** Untracked games at the data source; only runs when `enabled` (local results came up short). */
export function useExternalSearch(query: string, enabled: boolean) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["search-external", trimmed.toLowerCase()],
    queryFn: () => catalog.searchExternal(trimmed),
    enabled: enabled && trimmed.length >= 3,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export function useGame(slug: string) {
  return useQuery({
    queryKey: ["game", slug],
    queryFn: () => catalog.getGame(slug),
    staleTime: 10 * 60_000,
  });
}

export function useHomeSections() {
  return useQuery({
    queryKey: ["home"],
    queryFn: () => catalog.getHomeSections(),
    staleTime: 10 * 60_000,
  });
}
