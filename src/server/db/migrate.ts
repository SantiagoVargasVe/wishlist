import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { getConfig } from "../config";

/**
 * Apply pending migrations.
 *
 * Called from `instrumentation.ts` at server startup in production, so a deploy
 * needs no separate migration step — which matters because deploys are
 * unattended (ADR-0007: an image lands in GHCR and a timer pulls it).
 *
 * Safe here because there is exactly one app instance. With replicas this would
 * race and belong in a one-shot job instead.
 *
 * Uses its own single-connection client rather than the shared pool in
 * `db/index.ts`: this runs before the app serves traffic, and a migration
 * holding a pooled connection open is a bad way to start.
 */
export async function runMigrations(): Promise<void> {
  const { DATABASE_URL } = getConfig();
  // Notices here are all benign 'already exists, skipping' from the migrator's
  // own bookkeeping, and they fire on every container start.
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });

  try {
    await migrate(drizzle(sql), {
      migrationsFolder: "./src/server/db/migrations",
    });
  } finally {
    await sql.end();
  }
}
