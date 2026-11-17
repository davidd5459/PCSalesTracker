/**
 * Data-access layer. The UI only talks to this interface; VITE_DATA_SOURCE
 * picks the implementation ("api" = the real backend, anything else = sample data).
 */
import type { ExternalGame, GameDetail, GameSummary, HomeSections } from "../types";
import { httpCatalog } from "./httpCatalog";
import { sampleCatalog } from "./sampleCatalog";

export interface CatalogApi {
  search(query: string, limit?: number): Promise<GameSummary[]>;
  getGame(slug: string): Promise<GameDetail | null>;
  getHomeSections(): Promise<HomeSections>;
  /** Games at the data source that we don't track yet. */
  searchExternal(query: string, limit?: number): Promise<ExternalGame[]>;
  /** Start tracking a game; resolves to its slug once its history is imported. */
  importGame(itadId: string): Promise<string>;
}

/** True while the app is running on generated sample data. */
export const USING_SAMPLE_DATA = import.meta.env.VITE_DATA_SOURCE !== "api";

export const catalog: CatalogApi = USING_SAMPLE_DATA ? sampleCatalog : httpCatalog;
