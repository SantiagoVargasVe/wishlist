import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getConfig } from "../config";
import * as schema from "./schema";
import type { Db } from "./types";

/**
 * The shared database handle.
 *
 * A function, not a module-level constant, for the same reason config is lazy:
 * importing a module should not open a connection or demand an environment.
 * Services call `getDb()` inside a function body, which keeps them importable
 * under test without a live database.
 *
 * Only `src/server/services/` should call this. `src/app/` importing anything
 * from here is an ESLint error (ADR-0001) — routes delegate to services, and
 * services own the data layer.
 *
 * The connection is cached on globalThis in development because Next's HMR
 * re-evaluates modules on every edit; without it, each save opens a new pool
 * and Postgres runs out of connections within minutes of work.
 */
const globalForDb = globalThis as unknown as {
  __wishlistSql?: ReturnType<typeof postgres>;
  __wishlistDb?: Db;
};

export function getDb(): Db {
  if (globalForDb.__wishlistDb) return globalForDb.__wishlistDb;

  const config = getConfig();
  const client =
    globalForDb.__wishlistSql ??
    postgres(config.DATABASE_URL, {
      max: config.NODE_ENV === "production" ? 10 : 4,
    });

  const db = drizzle(client, { schema });

  if (config.NODE_ENV !== "production") {
    globalForDb.__wishlistSql = client;
    globalForDb.__wishlistDb = db;
  }

  return db;
}

export type { Db } from "./types";
