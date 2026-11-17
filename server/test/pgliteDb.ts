/** In-memory Postgres (PGlite) implementing our Db interface, for tests. */
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import type { Db, Row, Tx } from "../db/client.js";

interface PgLike {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}

function wrap(pg: PgLike): Tx {
  return {
    query: async <T extends Row>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows,
    exec: async (sql: string) => {
      await pg.exec(sql);
    },
  };
}

export async function createTestDb(): Promise<Db> {
  const pg = await PGlite.create({ extensions: { pg_trgm } });
  return {
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  };
}
