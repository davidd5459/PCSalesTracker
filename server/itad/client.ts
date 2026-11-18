/**
 * IsThereAnyDeal API client.
 * - Sends the key in the ITAD-API-Key header (keeps it out of URLs and logs).
 * - Spaces requests out to stay well under the rate limit (1000 per 5 minutes).
 * - Retries on 429 (honoring Retry-After) and on transient server errors.
 * - Validates every response against a schema.
 */
import type { z } from "zod";
import { ConfigError } from "../db/client.js";
import {
  GameInfoResponse,
  HistoryResponse,
  PopularResponse,
  PricesResponse,
  SearchResponse,
  ShopsResponse,
} from "./schemas.js";

const BASE_URL = "https://api.isthereanydeal.com";
const COUNTRY = "US";
/** ~2.9 requests/second = ~860 per 5 minutes, under the 1000 limit. */
const MIN_INTERVAL_MS = 350;
const MAX_RETRIES = 3;

/** ITAD accepts timestamps to the second: "2026-11-09T07:00:00Z", not "…07:00:00.000Z". */
export function toItadTime(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export type RankedList = "most-popular" | "most-waitlisted" | "most-collected";

export class ItadError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ItadError";
  }
}

interface RequestOptions {
  params?: Record<string, string | number | undefined>;
  body?: unknown;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ItadClient {
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(
    private readonly apiKey: string,
    private readonly minIntervalMs = MIN_INTERVAL_MS,
  ) {}

  shops() {
    return this.request(ShopsResponse, "/service/shops/v1", { params: { country: COUNTRY } });
  }

  search(title: string, results = 20) {
    return this.request(SearchResponse, "/games/search/v1", { params: { title, results } });
  }

  info(id: string) {
    return this.request(GameInfoResponse, "/games/info/v2", { params: { id } });
  }

  /** Full price change log for one game, filtered to the given shops. */
  history(id: string, opts: { shops: number[]; since?: string }) {
    return this.request(HistoryResponse, "/games/history/v2", {
      params: { id, country: COUNTRY, shops: opts.shops.join(","), since: opts.since && toItadTime(opts.since) },
    });
  }

  /** Current prices (with store URLs) for up to a batch of games. */
  prices(ids: string[], shops: number[]) {
    return this.request(PricesResponse, "/games/prices/v3", {
      params: { country: COUNTRY, shops: shops.join(",") },
      body: ids,
    });
  }

  /** A ranked list of games. ITAD's lists end at position 600; later offsets repeat the last page. */
  ranked(list: RankedList, offset: number, limit: number) {
    return this.request(PopularResponse, `/stats/${list}/v1`, { params: { offset, limit } });
  }

  mostPopular(offset: number, limit: number) {
    return this.request(PopularResponse, "/stats/most-popular/v1", { params: { offset, limit } });
  }

  /** Requests run one at a time, spaced by minIntervalMs. */
  private request<S extends z.ZodType>(schema: S, path: string, opts: RequestOptions = {}): Promise<z.infer<S>> {
    const run = this.queue.then(() => this.send(schema, path, opts));
    this.queue = run.catch(() => {});
    return run;
  }

  private async send<S extends z.ZodType>(schema: S, path: string, opts: RequestOptions): Promise<z.infer<S>> {
    const url = new URL(path, BASE_URL);
    for (const [k, v] of Object.entries(opts.params ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    for (let attempt = 0; ; attempt++) {
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();

      let res: Response;
      try {
        res = await fetch(url, {
          method: opts.body === undefined ? "GET" : "POST",
          headers: {
            "ITAD-API-Key": this.apiKey,
            Accept: "application/json",
            ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new ItadError(`${path}: network error (${(err as Error).message})`);
      }

      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("Retry-After")) || 30;
        console.warn(`ITAD rate limit hit; waiting ${retryAfter}s`);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (res.status >= 500 && attempt < MAX_RETRIES) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 200);
        throw new ItadError(`${path}: HTTP ${res.status} ${detail}`, res.status);
      }

      const parsed = schema.safeParse(await res.json());
      if (!parsed.success) {
        const issues = parsed.error.issues
          .slice(0, 5)
          .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("\n");
        throw new ItadError(`${path}: unexpected response shape\n${issues}`);
      }
      return parsed.data;
    }
  }
}

let shared: ItadClient | null = null;

/** Shared client for the API, using ITAD_API_KEY. Created on first use. */
export function getItadClient(): ItadClient {
  if (!shared) {
    const key = process.env.ITAD_API_KEY;
    if (!key) throw new ConfigError("ITAD_API_KEY is not set");
    shared = new ItadClient(key);
  }
  return shared;
}
