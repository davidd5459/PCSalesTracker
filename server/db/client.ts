/**
 * Minimal database interfaces so the same query code runs against:
 * - Neon over HTTP (serverless API: one stateless request per query)
 * - Neon over WebSockets (scripts: transactions, multi-statement migrations)
 * - PGlite (in-memory Postgres for tests)
 */
import { neon, Pool } from "@neondatabase/serverless";

export type Row = Record<string, unknown>;

export interface Queryable {
  /** Run one parameterized statement ($1, $2, …) and return its rows. */
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface Tx extends Queryable {
  /** Run one or more statements without parameters (e.g. a migration file). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Tx {
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Thrown when required configuration (env vars) is missing. */
export class ConfigError extends Error {}

let httpDb: Queryable | null = null;

/** Shared HTTP client for the API. Created on first use. */
export function getHttpDb(): Queryable {
  if (!httpDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new ConfigError("DATABASE_URL is not set");
    const sql = neon(url);
    httpDb = {
      query: async <T extends Row>(text: string, params: unknown[] = []) =>
        (await sql.query(text, params)) as unknown as T[],
    };
  }
  return httpDb;
}

type RunQuery = (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

function wrap(run: RunQuery): Tx {
  return {
    query: async <T extends Row>(text: string, params?: unknown[]) => (await run(text, params)).rows as T[],
    exec: async (sql: string) => {
      await run(sql);
    },
  };
}

/** Pooled WebSocket client for scripts (supports transactions). */
export function createPoolDb(connectionString: string): Db {
  const pool = new Pool({ connectionString, max: 4 });
  return {
    ...wrap((text, params) => pool.query(text, params as unknown[])),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(wrap((text, params) => client.query(text, params as unknown[])));
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
