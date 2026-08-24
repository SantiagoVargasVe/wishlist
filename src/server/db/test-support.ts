import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { pgCodeOf } from "./pg-errors";
import * as schema from "./schema";

/**
 * Test harness for real-Postgres integration tests.
 *
 * Not `server-only`: this runs under Vitest, outside Next. Nothing in `src/app`
 * or `src/server` should ever import it.
 *
 * We test against a real database rather than a mocked Drizzle because the
 * invariants that matter most here are enforced by Postgres — citext
 * uniqueness, the partial index for one default list per user (T020), the
 * unique claim constraint (T040). A mock would let every one of them through.
 */

export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST;

// Skipping locally is fine — unit tests should run without Docker. Skipping in
// CI is not: a silent skip looks identical to a pass on the pull request.
if (process.env.CI && !TEST_DATABASE_URL) {
  throw new Error(
    "DATABASE_URL_TEST is required in CI. Integration tests must not be skipped there.",
  );
}

export const hasTestDatabase = Boolean(TEST_DATABASE_URL);

// Re-exported so tests have one import. Definitions live in pg-errors.ts,
// which application code uses too.
export {
  PG_UNIQUE_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
  PG_CHECK_VIOLATION,
  PG_NOT_NULL_VIOLATION,
} from "./pg-errors";

/**
 * Run a query and return the SQLSTATE code it failed with, or `undefined` if it
 * succeeded. Asserting on the code beats matching message text, which shifts
 * between Postgres versions and locales.
 */
export async function pgErrorCode(
  promise: Promise<unknown>,
): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return pgCodeOf(error);
  }
}

export type TestDb = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sql: ReturnType<typeof postgres>;
  close: () => Promise<void>;
};

/**
 * Connect, wipe, and migrate.
 *
 * Both `public` and `drizzle` are dropped. Dropping only `public` wipes the
 * *effects* of past migrations while leaving them recorded as applied in the
 * `drizzle` journal, so migrate() skips them — the suite then passes once and
 * fails on every rerun.
 */
export async function createTestDb(): Promise<TestDb> {
  if (!TEST_DATABASE_URL) {
    throw new Error("DATABASE_URL_TEST is not set");
  }

  // Silence "already exists, skipping" NOTICEs — dropping and recreating the
  // schema every run emits a wall of them that buries real test output.
  const sql = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });

  await sql.unsafe(`
    DROP SCHEMA IF EXISTS public CASCADE;
    DROP SCHEMA IF EXISTS drizzle CASCADE;
    CREATE SCHEMA public;
  `);

  const db = drizzle(sql, { schema });
  await migrate(db, { migrationsFolder: "./src/server/db/migrations" });

  return { db, sql, close: () => sql.end() };
}
