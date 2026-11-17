import type { GameDetail, GameSummary, HomeSections } from "../types";
import type { CatalogApi } from "./catalog";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new ApiError(`GET ${path} failed with ${res.status}`, res.status);
  return res.json() as Promise<T>;
}

/** Talks to the backend API (server/app.ts). */
export const httpCatalog: CatalogApi = {
  search(query, limit = 8) {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return getJson<GameSummary[]>(`/api/search?${params}`);
  },

  async getGame(slug) {
    try {
      return await getJson<GameDetail>(`/api/games/${encodeURIComponent(slug)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },

  getHomeSections() {
    return getJson<HomeSections>("/api/home");
  },
};
