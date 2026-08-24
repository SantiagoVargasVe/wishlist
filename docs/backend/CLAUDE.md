# Backend Context

Scope: `src/server/` (db, services, og, net, auth) and the Route Handlers in `src/app/api/`.

Read [security.md](../context/security.md) before touching `src/server/net/` or `src/server/og/`.
It is not optional for that code.

## Layering

```
src/app/api/**/route.ts   Zod parse → call service → serialize. Nothing else.
src/server/services/      Domain logic. Owns transactions. Framework-agnostic.
src/server/db/            Drizzle schema + migrations. Only services import this.
src/server/og/            Scraper, parser, image pipeline.
src/server/net/           safe-fetch. The only place outbound HTTP happens.
src/server/auth/          JWT signing/verification, session helpers.
```

Route handlers stay thin enough to read in one screen. If there's an `if` about domain rules in
a route file, it belongs in a service.

Services take plain arguments and return plain objects — no `Request`, no `NextResponse`. That's
what keeps them testable without booting Next.

## Authorization

Every service that touches a wishlist or item takes the acting `userId` and checks ownership
**inside the service**. Don't rely on a route handler having checked. The public claim path is
the sole exception, and it's gated on slug possession instead.

Two shared primitives (`src/server/auth/`), used by every "O" endpoint:

- `requireUserId()` — throws `UnauthorizedError` if there's no session. Route handlers call this
  first, before touching a service.
- `assertOwned(resource, userId, notFoundFactory)` — takes a fetched row, throws `NotFoundError`
  if it's missing and `ForbiddenError` if it exists but belongs to someone else. This is what
  implements the **404 truly missing / 403 exists but not yours** split in
  [api-contract.md](../context/api-contract.md) — don't reimplement it per resource, and don't
  collapse the two into one status; each leaks or hides something the other doesn't.

## Queries

- Always filter `deleted_at IS NULL` on items. Consider a `liveItems` helper so nobody forgets.
- `GET /api/me` is one aggregate query, not N+1 across lists.
- Let the DB enforce invariants: the partial unique index for one default list per user, and the
  unique constraint on `item_claims.item_id`. **Don't do read-then-write for claims** — it races,
  and two people double-buying a gift is exactly the bug this app exists to prevent. Insert and
  catch the constraint violation as a `409`.

## Transactions

Wrap multi-step writes. Registration especially: user + consume invite code + create the default
wishlist all commit together, or a failure leaves an account with no list and a burned code.

## The OG pipeline

```
url → safe-fetch → parse head → cache → (on save) fetch image → sharp → data/images/
```

**Parsing precedence**

| Field | Order |
|---|---|
| title | `og:title` → `twitter:title` → `<title>` |
| image | `og:image` → `twitter:image` → JSON-LD `Product.image` |
| price | `product:price:amount` → JSON-LD `Product.offers.price` |
| currency | `product:price:currency` → JSON-LD `offers.priceCurrency` |
| siteName | `og:site_name` → domain |

Expect title/image ~90%, price ~50%. **`og_status: "failed"` is a normal outcome, not an
exception.** Never let it fail a save or throw into a route handler.

Treat everything parsed as **untrusted input** — a hostile page can return a 10MB `og:title` or
embedded markup. Truncate (title 300, description 1000), strip tags, validate the image URL
before it goes anywhere near `safe-fetch`.

Cache by sha256 of the normalized URL (strip `utm_*`, fragments, trailing slash).

**Image pipeline:** fetch through `safe-fetch` with `image/*` and a 10MB cap → `sharp` → max
800px wide → webp q80 (~30–60KB) → write `data/images/{item_id}.webp`. Store `image_path` *and*
`source_image_url`. Runs async after the item row is created — the user shouldn't wait on it.

## Money

`numeric(14,2)` + ISO code. Read as string, use a decimal type, **never a JS float.**

On write, compute `price_usd_snapshot` from the configured FX rate and record `fx_rate_used`
beside it. Filtering and sorting use the snapshot; responses always carry the original amount and
currency. The snapshot is an internal approximation and is never displayed.

## Errors

Services throw typed domain errors (`NotFoundError`, `ForbiddenError`, `ConflictError`,
`RateLimitError`). One mapper converts them to the wire format in
[api-contract.md](../context/api-contract.md). Don't build response objects inside services.

Never leak internals to clients — especially from `safe-fetch`, where `ECONNREFUSED` vs. timeout
reveals which internal ports are open. Log the detail, return something generic.

## Rate limiting

Token bucket in the `rate_limits` table. No Redis — the volume doesn't justify a container, and
Cloudflare absorbs anything large first. Key by IP for anonymous routes, user id for
authenticated ones. Return `429` with `Retry-After`.

## Migrations

Drizzle Kit. `npm run db:generate` after schema edits, review the generated SQL, commit it with
the schema change. Never hand-edit an applied migration.

## Testing

Full strategy and thresholds: [testing.md](../context/testing.md). Backend specifics:

1. **`safe-fetch`** — every denied range, redirect-to-private, DNS rebinding, scheme rejection.
   Exhaustive; it's the highest-risk code in the repo.
2. Claim concurrency — two simultaneous claims, exactly one wins.
3. Deletion semantics — last-list removal, default-list protection, claims surviving soft delete.
4. OG parsing — fixture HTML for each precedence path plus a no-metadata page.

Vitest, no network in tests. Test against a **real Postgres**, not a mocked Drizzle — the
invariants that matter most (the partial unique index, the claim constraint) are enforced by the
database, and a mock will happily let a double claim through.

Coverage gates: `src/server/net/**` 90%, `src/server/services/**` 80%. Nothing else is gated.

## Jobs

Weekly orphan image sweep: delete files in `data/images/` with no live referencing item. Runs
locally, makes **no outbound requests**. It is not a scraper — see
[ADR-0004](../adr/0004-store-images.md) for why nothing re-crawls on a schedule.
