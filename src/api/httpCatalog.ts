import type { ExternalGame, GameDetail, GameSummary, HomeSections } from "../types";
import type { CatalogApi } from "./catalog";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  if (!res.ok) {
    // The API explains refusals in { error }; show that rather than a bare status code.
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `${init?.method ?? "GET"} ${path} failed with ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

const getJson = <T>(path: string) => request<T>(path);

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

  searchExternal(query, limit = 6) {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return getJson<ExternalGame[]>(`/api/search/external?${params}`);
  },

  async importGame(itadId) {
    const { slug } = await request<{ slug: string }>("/api/games/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itadId }),
    });
    return slug;
  },
};
