import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "../db";
import type { Db } from "../db/types";
import { RateLimitError } from "../errors";
import type { RateLimitPolicy } from "./policies";

/**
 * Token-bucket rate limiting, stored in Postgres.
 *
 * A bucket holds up to `capacity` tokens and refills continuously at
 * `capacity / windowSeconds` per second. Each request spends one.
 *
 * Token bucket rather than a fixed window because a fixed window lets a client
 * spend its whole quota at the end of one window and again at the start of the
 * next — twice the intended burst — and it synchronises clients into herds at
 * each boundary.
 *
 * No Redis: the volume doesn't justify another container, and Cloudflare
 * absorbs anything genuinely large before it reaches us.
 */

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export async function consume(
  policy: RateLimitPolicy,
  key: string,
  db: Db = getDb(),
): Promise<RateLimitResult> {
  const refillPerSecond = policy.capacity / policy.windowSeconds;

  try {
    // One statement, deliberately. A read-then-write lets two concurrent
    // requests both observe the last token and both take it — exactly the
    // failure a rate limiter exists to prevent.
    //
    // The WHERE on DO UPDATE is what makes rejection safe: when the bucket is
    // empty the update is skipped entirely, so `updated_at` is NOT advanced.
    // Advancing it would restart the refill clock on every rejected request,
    // and a client hammering the endpoint would never recover.
    const rows = await db.execute<{ tokens: number }>(sql`
      INSERT INTO rate_limits (key, tokens, updated_at)
      VALUES (${key}, ${policy.capacity - 1}, now())
      ON CONFLICT (key) DO UPDATE SET
        tokens = LEAST(
          ${policy.capacity}::double precision,
          rate_limits.tokens
            + EXTRACT(EPOCH FROM (now() - rate_limits.updated_at)) * ${refillPerSecond}
        ) - 1,
        updated_at = now()
      WHERE LEAST(
        ${policy.capacity}::double precision,
        rate_limits.tokens
          + EXTRACT(EPOCH FROM (now() - rate_limits.updated_at)) * ${refillPerSecond}
      ) >= 1
      RETURNING tokens
    `);

    const row = rows[0] as { tokens: number } | undefined;
    if (row) return { allowed: true, remaining: Math.floor(row.tokens) };

    // Rejected. One extra read on the slow path to give an honest Retry-After.
    const state = await db.execute<{ available: number }>(sql`
      SELECT LEAST(
        ${policy.capacity}::double precision,
        tokens + EXTRACT(EPOCH FROM (now() - updated_at)) * ${refillPerSecond}
      ) AS available
      FROM rate_limits WHERE key = ${key}
    `);

    const available = Number((state[0] as { available: number } | undefined)?.available ?? 0);
    const secondsToOneToken = Math.max(1, Math.ceil((1 - available) / refillPerSecond));

    return { allowed: false, retryAfterSeconds: secondsToOneToken };
  } catch (error) {
    // Fail open. A rate-limiter outage should not take the site down, and if
    // the database is unreachable the request was going to fail anyway.
    console.error("Rate limit check failed, allowing request:", error);
    return { allowed: true, remaining: -1 };
  }
}

/** Consume a token or throw. What route handlers call. */
export async function enforce(
  policy: RateLimitPolicy,
  key: string,
  db?: Db,
): Promise<void> {
  const result = await consume(policy, key, db);
  if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds);
}

/**
 * Delete idle buckets.
 *
 * Safe because buckets refill: a row untouched for longer than its window is
 * indistinguishable from a fresh one. Without this the table grows a row per
 * distinct IP forever.
 */
export async function pruneIdleBuckets(
  olderThanSeconds: number,
  db: Db = getDb(),
): Promise<number> {
  const rows = await db.execute<{ key: string }>(sql`
    DELETE FROM rate_limits
    WHERE updated_at < now() - make_interval(secs => ${olderThanSeconds})
    RETURNING key
  `);
  return rows.length;
}
