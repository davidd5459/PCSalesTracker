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
