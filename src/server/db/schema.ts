import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema.
 *
 * Invariants belong in the database, not in application code. See
 * docs/context/data-model.md before adding anything here.
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
  /**
   * The account's session epoch: a JWT whose `iat` predates this is no longer
   * a session (ADR-0012). Bumping it on password reset is what makes tokens
   * revocable, which ADR-0003 deferred until something needed it.
   *
   * Not nullable, and defaulted rather than left empty. A null would force
   * every read site to decide what null means, and the answer is always "the
   * account's epoch" — so the column says that instead of the callers.
   */
  sessionsValidFrom: timestamp("sessions_valid_from", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
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
 * Single-use password reset tokens (ADR-0012).
 *
 * The primary key is the token's **SHA-256**, never the token itself: a leaked
 * backup or a stray `SELECT *` in a log then hands over nothing usable. SHA-256
 * rather than Argon2 is deliberate and is not an oversight — the ADR's "Why
 * SHA-256 for the token" has the reasoning, in short that a 256-bit CSPRNG
 * secret is not guessable at any cost per attempt, so a memory-hard hash would
 * add ~100ms to every lookup and buy nothing.
 *
 * A table rather than a signed JWT because a reset link must be **single-use**,
 * and statelessness is precisely the property that makes that impossible.
 * Consumption is one conditional UPDATE (T102), for the same reason invite
 * consumption is.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    /** "Delete this user's other outstanding tokens" is a real query path. */
    index("password_reset_tokens_user_idx").on(table.userId),
  ],
);

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

/**
 * Caches a successful OG scrape by URL hash, so re-pasting the same link is
 * free. `url_hash` is the sha256 of the URL with its fragment stripped —
 * see `normalizeUrl` in `src/server/og/preview.ts`. Only successful scrapes
 * are ever written here; a failed one is treated as transient (roughly half
 * of retailers block scraping at all), so it's never cached as a dead end.
 */
export const ogCache = pgTable("og_cache", {
  urlHash: text("url_hash").primaryKey(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

/**
 * A named collection of items.
 *
 * `slug` is what appears in a share URL, not the uuid — shorter, and it keeps
 * the primary key out of links. Possession of the slug IS the permission for
 * the public view, so it must be unguessable, not merely unique.
 */
export const wishlists = pgTable(
  "wishlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    isDefault: boolean("is_default").notNull().default(false),
    /**
     * Defaults to true. A spoiled surprise is the one outcome you cannot
     * recover from, so the safe direction is hiding claims (ADR-0005).
     */
    hideClaimsFromOwner: boolean("hide_claims_from_owner")
      .notNull()
      .default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    /**
     * Exactly one default list per user, enforced by Postgres rather than
     * application code — a partial unique index cannot be raced, whereas a
     * check-then-insert can.
     */
    uniqueIndex("wishlists_one_default_per_owner")
      .on(table.ownerId)
      .where(sql`${table.isDefault}`),
    index("wishlists_owner_idx").on(table.ownerId),
  ],
);

/**
 * A saved product.
 *
 * Scoped to its owner: two users pasting the same link get two independent
 * rows, so bought state can never leak between them.
 */
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title").notNull(),
    notes: text("notes"),

    /** Bare filename resolved against the images directory, e.g. `<uuid>.webp`. */
    imagePath: text("image_path"),
    /** Kept so a lost image can be re-fetched while the listing is live (ADR-0004). */
    sourceImageUrl: text("source_image_url"),
    siteName: text("site_name"),

    /**
     * Money is numeric, never float, and stored exactly as the owner entered
     * it — no derived conversion. See docs/context/data-model.md § Money and
     * ADR-0009 for why there's no USD snapshot: converting at write time
     * bakes in whatever rate was current *then*, so two items saved months
     * apart compare against different rates and were never comparable to
     * begin with. There's no cross-currency filter to serve that math anyway.
     */
    priceAmount: numeric("price_amount", { precision: 14, scale: 2 }),
    priceCurrency: char("price_currency", { length: 3 }),

    /** `failed` is a normal outcome — roughly half of retailers block scraping. */
    ogStatus: text("og_status").notNull().default("pending"),
    ogFetchedAt: timestamp("og_fetched_at", { withTimezone: true }),

    /**
     * Soft delete. An item may already be claimed, and hard-deleting would
     * destroy that record and make an accidental delete unrecoverable.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    check(
      "items_og_status_valid",
      sql`${table.ogStatus} IN ('pending', 'ok', 'failed', 'manual')`,
    ),
    /**
     * Only what the FX snapshot can actually normalise. Adding a currency is a
     * migration, which is the honest cost — silently storing an unsupported
     * code would corrupt filtering with no visible error.
     */
    check(
      "items_currency_supported",
      sql`${table.priceCurrency} IS NULL OR ${table.priceCurrency} IN ('COP', 'USD')`,
    ),
    /** A price with no currency is meaningless, and so is the reverse. */
    check(
      "items_price_currency_paired",
      sql`(${table.priceAmount} IS NULL) = (${table.priceCurrency} IS NULL)`,
    ),
    /** Every read filters deleted rows, so the index matches that shape. */
    index("items_owner_live_idx")
      .on(table.ownerId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/** Many-to-many. Hard delete: unfiling an item is not destructive. */
export const wishlistItems = pgTable(
  "wishlist_items",
  {
    wishlistId: uuid("wishlist_id")
      .notNull()
      .references(() => wishlists.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    primaryKey({ columns: [table.wishlistId, table.itemId] }),
    index("wishlist_items_item_idx").on(table.itemId),
  ],
);

/**
 * One active claim per item, anywhere it appears. Claims attach to the item
 * itself, not to a `wishlist_items` row — a physical gift, bought once, shows
 * as bought on every list it's filed under.
 *
 * `claimedByUserId` is set for a logged-in claimer and null for an anonymous
 * one, but neither is ever exposed in a response — visitors see "reserved",
 * never who (ADR-0005). `claimToken` is what lets an anonymous claimer undo
 * their own claim without an account.
 */
export const itemClaims = pgTable("item_claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id")
    .notNull()
    .unique()
    .references(() => items.id, { onDelete: "cascade" }),
  claimedByUserId: uuid("claimed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  claimToken: text("claim_token").notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type InviteCode = typeof inviteCodes.$inferSelect;
export type NewInviteCode = typeof inviteCodes.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
export type RateLimit = typeof rateLimits.$inferSelect;
export type OgCache = typeof ogCache.$inferSelect;
export type NewOgCache = typeof ogCache.$inferInsert;
export type Wishlist = typeof wishlists.$inferSelect;
export type NewWishlist = typeof wishlists.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type WishlistItem = typeof wishlistItems.$inferSelect;
export type ItemClaim = typeof itemClaims.$inferSelect;
export type NewItemClaim = typeof itemClaims.$inferInsert;
