import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { config } from "../config";
import * as schema from "./schema";

/**
 * The database client.
 *
 * Only `src/server/services/` may import this. `src/app/` reaching in here is
 * an ESLint error (ADR-0001) — route handlers call services, services own the DB.
 *
 * The connection is cached on globalThis in development because Next's HMR
 * re-evaluates modules on every edit; without this, each save opens a new pool
 * and Postgres runs out of connections within a few minutes of work.
 */

const globalForDb = globalThis as unknown as {
  __wishlistSql?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__wishlistSql ??
  postgres(config.DATABASE_URL, {
    max: config.NODE_ENV === "production" ? 10 : 4,
  });

if (config.NODE_ENV !== "production") {
  globalForDb.__wishlistSql = client;
}

export const db = drizzle(client, { schema });

export type Db = typeof db;
