import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, hasTestDatabase, type TestDb } from "./test-support";

describe.skipIf(!hasTestDatabase)("migrations", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it("enable the citext extension", async () => {
    // Required by users.email so casing can't create a duplicate account.
    const rows = await ctx.sql`SELECT 1 FROM pg_extension WHERE extname = 'citext'`;
    expect(rows).toHaveLength(1);
  });

  it("create the expected tables", async () => {
    const rows = await ctx.sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    const names = rows.map((r) => r.table_name);
    expect(names).toContain("users");
    expect(names).toContain("invite_codes");
  });

  it("record applied migrations so they are not reapplied", async () => {
    const rows = await ctx.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations
    `;
    expect(Number(rows[0].count)).toBeGreaterThan(0);
  });
});
