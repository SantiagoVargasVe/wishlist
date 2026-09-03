# Data Model

Canonical schema lives in `src/server/db/schema.ts` (Drizzle). This doc explains the *why* —
the invariants that aren't visible in column definitions.

```mermaid
erDiagram
  users ||--o{ wishlists : owns
  users ||--o{ items : owns
  wishlists ||--o{ wishlist_items : contains
  items ||--o{ wishlist_items : "appears in"
  items ||--o| item_claims : "claimed by"
  users ||--o{ invite_codes : issues
```

## Tables

### `users`
`id` uuid pk · `email` citext unique · `password_hash` · `display_name` ·
`email_verified_at` null · `sessions_valid_from` · timestamps

Argon2id for hashing. Email is `citext` so casing never causes a duplicate account.

`email_verified_at` is null until the address is confirmed reachable
([ADR-0013](../adr/0013-email-verification-gates-recovery.md)). A timestamp rather than a boolean
because it answers "when", which an audit trail wants and a boolean can't. It gates **exactly
one** thing — `/api/auth/forgot-password` sends nothing to an unverified address — and nothing
else: not login, not any other route. Blocking login would lock out every existing account on
deploy and make outbound mail a hard dependency, contradicting
[ADR-0011](../adr/0011-outbound-email-via-smtp.md). **Existing rows are deliberately not
backfilled**; a blanket backfill would bless exactly the mistyped addresses verification exists
to catch.

`sessions_valid_from` is the account's **session epoch**: a session JWT whose `iat` predates it
is no longer a session. It is what makes tokens revocable, which
[ADR-0003](../adr/0003-jwt-in-httponly-cookie.md) deferred and
[ADR-0012](../adr/0012-password-reset-via-single-use-token.md) needed — a password reset that
leaves someone else's 30-day cookie working has done nothing about the actual problem. Not
nullable: a null would push "what does null mean here" onto every read site, and the answer is
always "the account's epoch".

### `invite_codes`
`code` pk · `created_by` → users · `used_by` → users null · `used_at` · `expires_at` · `created_at`

Single-use. Registration is invite-gated because the site sits on a public URL.

### `password_reset_tokens`
`token_hash` pk (sha256 of the token) · `user_id` → users **cascade** · `purpose` ·
`expires_at` · `used_at` null · `created_at`

Single-use recovery tokens ([ADR-0012](../adr/0012-password-reset-via-single-use-token.md)).
Three things are load-bearing:

- **Only the SHA-256 is stored.** A leaked backup, or a stray `SELECT *` in a log, then hands
  over nothing usable. SHA-256 and not Argon2 on purpose: the token is 256 bits from a CSPRNG,
  so it isn't guessable at any cost per attempt, and a memory-hard hash would add ~100ms to
  every lookup for nothing. That reasoning does *not* transfer to passwords.
- **A table rather than a signed JWT**, because a reset link must be single-use and
  statelessness is exactly what makes that impossible.
- **Consumption is one conditional UPDATE** (`WHERE used_at IS NULL AND expires_at > now()`),
  the same shape as invite consumption and for the same reason: a read-then-write lets two
  concurrent requests both observe an unused token.

`purpose` ∈ `password_reset | email_verify`, enforced by a CHECK rather than convention. One
table with a discriminator, not two near-identical ones: both kinds are the same object — a
high-entropy secret, stored hashed, bound to a user, expiring, single-use — and they share the
atomic-consume statement that is the most security-sensitive and most easily-got-wrong part of
ADR-0012. If a purpose ever needs its own columns, splitting the table then is a mechanical
migration; reconciling two subtly different consume implementations is not.

The column carries a database default of `password_reset`, which exists so existing rows land on
the only value they can honestly have when the migration runs. It is **not** an invitation to
omit the field — a verification token that silently became a `password_reset` one would be a
reset link mailed to an unverified address, which is the takeover path ADR-0013 closes. Every
caller passes it explicitly, and consumption filters on it in both directions.

The index on `user_id` serves "delete this user's other outstanding tokens", which consumption
does. It is deliberately not extended with `purpose` — a user holds a handful of rows at most, so
the filter costs nothing the index would save. Rows accumulate — a row per request, never swept —
which at this scale is a rounding error.

### `wishlists`
`id` uuid pk · `owner_id` → users · `title` · `slug` unique · `is_default` bool ·
`hide_claims_from_owner` bool default **true** · timestamps

- `slug` is a 10-char nanoid, not the UUID. Shorter to share, and it keeps the primary key out
  of URLs. **Possession of the slug is the permission** — there's no other access check on the
  public view.
- Partial unique index on `(owner_id) WHERE is_default` — exactly one default list per user,
  enforced by the database rather than application code.
- The default list can be renamed but not deleted.

### `items`
`id` uuid pk · `owner_id` → users · `url` · `title` · `notes` · `image_path` ·
`source_image_url` · `site_name` · `price_amount` numeric(14,2) · `price_currency` char(3) ·
`price_usd_snapshot` numeric(14,2) · `fx_rate_used` numeric(14,6) · `og_status` ·
`og_fetched_at` · `deleted_at` · timestamps

- **Scoped to their owner.** Two users pasting the same MercadoLibre link get two independent
  rows. Bought state must never leak between users — this is the reason items aren't global.
- **Soft delete** via `deleted_at`. An item may already be claimed; hard-deleting would destroy
  the claim record and make an accidental delete unrecoverable. Every query filters
  `deleted_at IS NULL`.
- `og_status` ∈ `pending | ok | failed | manual`. `failed` is a normal outcome, not an error —
  roughly half of retailers block server-side scraping.
- `image_path` is a bare filename (`{item_id}.webp`) resolved against the images directory.
  `source_image_url` is kept alongside it so a manual re-fetch stays a one-liner.

### `wishlist_items`
pk `(wishlist_id, item_id)` · `position` int · `added_at`

The many-to-many join. Hard delete — removing an item from a list is not destructive.

### `item_claims`
`id` uuid pk · `item_id` → items **unique** · `claimed_by_user_id` → users null ·
`claim_token` · `claimed_at`

- The unique constraint on `item_id` enforces one active claim per item at the database level.
  Don't try to do this with a read-then-write in application code — it races.
- Claims attach to the **item**, not to `wishlist_items`. One physical gift, bought once, shows
  as bought everywhere it appears.
- `claim_token` is an opaque random string returned to the claimer and stored in their
  localStorage. It's what lets an anonymous visitor undo their own claim. Without it, one
  misclick locks an item permanently.

### `og_cache`
`url_hash` pk (sha256 of normalized URL) · `payload` jsonb · `fetched_at`

Avoids re-scraping a URL that was pasted recently. Also blunts abuse of `/api/preview`.

### `rate_limits`
`key` pk · `tokens` double precision · `updated_at`

Token bucket in Postgres. No Redis — the volume doesn't justify another container, and
Cloudflare absorbs anything large before it reaches us.

`tokens` is a float rather than an integer so refill is continuous: a bucket gaining 0.011
tokens per second behaves smoothly instead of stepping once per interval.

Consumption is a **single atomic statement** (`INSERT ... ON CONFLICT DO UPDATE ... WHERE`).
A read-then-write lets concurrent requests all observe the last token and all take it — the
exact failure a rate limiter exists to prevent. The `WHERE` on the update also means a rejected
request leaves `updated_at` untouched; advancing it would restart the refill clock on every
retry and lock a hammering client out permanently rather than for the window.

Rows accumulate one per distinct key, so `pruneIdleBuckets` deletes buckets idle longer than
their window — safe because a fully-refilled bucket is indistinguishable from a fresh one.

## Money

Stored as `numeric(14,2)` plus an explicit ISO code. **Never a float.** Displayed exactly as
entered — there is no conversion anywhere in this system. See [ADR-0009](../adr/0009-no-currency-conversion.md).

An earlier version of this schema also stored a `price_usd_snapshot`, computed at write time from
a configured FX rate, meant to let a single filter compare COP and USD items. It was removed: two
items saved months apart would have been converted using two different rates, so the very
comparison the snapshot existed for was never actually apples-to-apples — the design didn't just
go stale, it was inconsistent with itself from the moment a second currency appeared. There is no
cross-currency price filter in this product; COP and USD items are simply shown as entered.

COP amounts are large (a 1.3M COP item) but well inside `numeric(14,2)`.

## Deletion semantics

These are easy to get subtly wrong, so they're spelled out:

| Action | Effect |
|---|---|
| Remove item from a list | Delete the `wishlist_items` row only |
| Remove item from its **last** list | Also soft-delete the item — nothing lands in orphan limbo |
| Delete item | Soft delete; claims survive; join rows removed |
| Delete wishlist | Prompt about items that live *only* in that list |
| Delete default wishlist | Blocked |

"Remove from this list" and "delete item" must look clearly different in the UI, or people will
destroy items they meant to unfile.

Editing an item's `url` re-triggers the OG fetch. Editing anything else does not. An item edited
after being claimed keeps its claim — worth a small UI note so a gift-giver isn't surprised by a
changed price.

## Image lifecycle

Stored files are only reachable through their item row, so orphans are possible after deletes.
A weekly sweep removes files in `data/images/` with no live referencing item. It runs locally
and makes **no outbound requests** — it is not a scraper.
