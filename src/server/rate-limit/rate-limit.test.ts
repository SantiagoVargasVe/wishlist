import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, hasTestDatabase, type TestDb } from "../db/test-support";
import { consume, enforce, pruneIdleBuckets } from "./index";
import type { RateLimitPolicy } from "./policies";

/** 3 tokens, refilling one per second. Small numbers keep tests fast. */
const policy: RateLimitPolicy = { capacity: 3, windowSeconds: 3 };

/** Rewind a bucket's clock, so refill can be tested without waiting. */
async function ageBucket(ctx: TestDb, key: string, seconds: number) {
  await ctx.db.execute(sql`
    UPDATE rate_limits
    SET updated_at = updated_at - make_interval(secs => ${seconds})
    WHERE key = ${key}
  `);
}

describe.skipIf(!hasTestDatabase)("rate limiting", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.sql`TRUNCATE rate_limits`;
  });

  it("allows a burst up to capacity", async () => {
    for (let i = 0; i < policy.capacity; i += 1) {
      const result = await consume(policy, "k", ctx.db);
      expect(result.allowed).toBe(true);
    }
  });

  it("rejects the request after capacity is spent", async () => {
    for (let i = 0; i < policy.capacity; i += 1) {
      await consume(policy, "k", ctx.db);
    }

    const result = await consume(policy, "k", ctx.db);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("refills over time", async () => {
    for (let i = 0; i < policy.capacity; i += 1) {
      await consume(policy, "k", ctx.db);
    }
    expect((await consume(policy, "k", ctx.db)).allowed).toBe(false);

    await ageBucket(ctx, "k", 2);

    expect((await consume(policy, "k", ctx.db)).allowed).toBe(true);
  });

  it("never refills past capacity", async () => {
    await consume(policy, "k", ctx.db);
    await ageBucket(ctx, "k", 3600);

    // An hour of refill on a 3-token bucket must still leave exactly 3, or a
    // long-idle client could burst far beyond the policy.
    for (let i = 0; i < policy.capacity; i += 1) {
      expect((await consume(policy, "k", ctx.db)).allowed).toBe(true);
    }
    expect((await consume(policy, "k", ctx.db)).allowed).toBe(false);
  });

  it("keeps separate keys independent", async () => {
    for (let i = 0; i < policy.capacity; i += 1) {
      await consume(policy, "alice", ctx.db);
    }
    expect((await consume(policy, "alice", ctx.db)).allowed).toBe(false);
    expect((await consume(policy, "bob", ctx.db)).allowed).toBe(true);
  });

  it("does not reset the refill clock when it rejects", async () => {
    // Otherwise a client hammering the endpoint keeps pushing its own recovery
    // out of reach and is locked out permanently rather than for the window.
    for (let i = 0; i < policy.capacity; i += 1) {
      await consume(policy, "k", ctx.db);
    }

    // Half a second of refill at 1 token/sec is 0.5 tokens — not enough to
    // spend, so these attempts are genuinely rejected.
    await ageBucket(ctx, "k", 0.5);

    const first = await consume(policy, "k", ctx.db);
    const second = await consume(policy, "k", ctx.db);
    expect(first.allowed).toBe(false);
    expect(second.allowed).toBe(false);

    const [row] = await ctx.db.execute<{ age: number }>(sql`
      SELECT EXTRACT(EPOCH FROM (now() - updated_at)) AS age
      FROM rate_limits WHERE key = 'k'
    `);

    // The accrued 0.5s survives: rejections must not touch updated_at, or the
    // client's own retries would keep pushing recovery out of reach.
    expect(Number(row.age)).toBeGreaterThan(0.4);
  });

  it("cannot be over-consumed by concurrent requests", async () => {
    // The reason consumption is a single atomic statement. A read-then-write
    // lets several requests all see the last token and all take it.
    const attempts = 10;
    const results = await Promise.all(
      Array.from({ length: attempts }, () => consume(policy, "race", ctx.db)),
    );

    const allowed = results.filter((r) => r.allowed).length;
    expect(allowed).toBe(policy.capacity);
  });

  it("throws RateLimitError with a retry hint via enforce", async () => {
    for (let i = 0; i < policy.capacity; i += 1) {
      await enforce(policy, "k", ctx.db);
    }

    await expect(enforce(policy, "k", ctx.db)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
  });

  it("prunes idle buckets but keeps active ones", async () => {
    await consume(policy, "old", ctx.db);
    await consume(policy, "fresh", ctx.db);
    await ageBucket(ctx, "old", 7200);

    const deleted = await pruneIdleBuckets(3600, ctx.db);
    expect(deleted).toBe(1);

    const remaining = await ctx.db.execute<{ key: string }>(
      sql`SELECT key FROM rate_limits`,
    );
    expect(remaining.map((r) => r.key)).toEqual(["fresh"]);
  });
});
