import { sql } from "drizzle-orm";
import {
  customType,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema.
 *
 * Invariants belong in the database, not in application code. See
 * docs/context/data-model.md before adding anything here.
 *
 * Still to come:
 *   T020  wishlists, items, wishlist_items
 *   T040  item_claims
 */

/**
 * Case-insensitive text. Drizzle has no built-in citext, so it's a customType
 * over the extension enabled in migration 0000.
 *
 * Comparison and uniqueness are case-insensitive at the database level, which
 * is the only way to actually prevent `Santiago@x.com` and `santiago@x.com`
 * from becoming two accounts — a UNIQUE constraint on plain text won't.
 */
const citext = customType<{ data: string }>({
  dataType: () => "citext",
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

/**
 * Single-use registration codes (ADR-0002).
 *
 * `created_by` is nullable so the first code can be minted by a script before
 * any user exists. `used_by`/`used_at` mark consumption — a code with either set
 * is spent. Enforcing that pairing is T011's job.
 */
export const inviteCodes = pgTable("invite_codes", {
  code: text("code").primaryKey(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  usedBy: uuid("used_by").references(() => users.id, { onDelete: "set null" }),
  usedAt: timestamp("used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

/**
 * Token buckets for rate limiting.
 *
 * `key` is opaque and namespaced by the caller, e.g. `login:203.0.113.7`.
 *
 * `tokens` is a float, not an integer, so refill is continuous — a bucket that
 * gains 0.011 tokens per second behaves smoothly instead of stepping once per
 * interval.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    tokens: doublePrecision("tokens").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [index("rate_limits_updated_at_idx").on(table.updatedAt)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type InviteCode = typeof inviteCodes.$inferSelect;
export type NewInviteCode = typeof inviteCodes.$inferInsert;
export type RateLimit = typeof rateLimits.$inferSelect;
