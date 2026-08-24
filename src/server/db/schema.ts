import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  customType,
  doublePrecision,
  index,
  integer,
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
 *
 * Still to come:
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type InviteCode = typeof inviteCodes.$inferSelect;
export type NewInviteCode = typeof inviteCodes.$inferInsert;
export type RateLimit = typeof rateLimits.$inferSelect;
export type Wishlist = typeof wishlists.$inferSelect;
export type NewWishlist = typeof wishlists.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type WishlistItem = typeof wishlistItems.$inferSelect;
