import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB_URL = process.env.DATABASE_URL_TEST;

// Skipping locally is fine — unit tests should run without Docker. Skipping in
// CI is not: a silent skip looks identical to a pass on the PR. Fail loudly.
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "DATABASE_URL_TEST is required in CI. Integration tests must not be skipped there.",
  );
}

describe.skipIf(!TEST_DB_URL)("migrations", () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    sql = postgres(TEST_DB_URL!, { max: 1 });

    // Start from nothing so this asserts migrations work on a fresh database,
    // not that they happen to be idempotent against leftover state.
    //
    // The `drizzle` schema matters as much as `public`: it holds the migration
    // journal. Dropping only `public` wipes the *effects* of past migrations
    // while leaving them recorded as applied, so migrate() skips them and the
    // suite passes once then fails on every rerun.
    await sql.unsafe(`
      DROP SCHEMA IF EXISTS public CASCADE;
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      CREATE SCHEMA public;
    `);
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("apply cleanly to an empty database", async () => {
    await expect(
      migrate(drizzle(sql), { migrationsFolder: "./src/server/db/migrations" }),
    ).resolves.not.toThrow();
  });

  it("enables the citext extension", async () => {
    // Required by users.email (T010) so casing can't create a duplicate account.
    const rows = await sql`SELECT 1 FROM pg_extension WHERE extname = 'citext'`;
    expect(rows).toHaveLength(1);
  });

  it("records the migration so it is not reapplied", async () => {
    const rows = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations
    `;
    expect(Number(rows[0].count)).toBeGreaterThan(0);
  });
});
