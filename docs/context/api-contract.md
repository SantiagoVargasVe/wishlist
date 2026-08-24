# API Contract

All routes are Next.js Route Handlers under `src/app/api/`. JSON in, JSON out.

**Handlers are thin:** parse with Zod → call a service in `src/server/services/` → serialize.
No business logic and no Drizzle in a route file.

## Conventions

Auth is a JWT in an **httpOnly, Secure, SameSite=Lax cookie** — not `localStorage`, which is
readable by any XSS. Same-origin FE/BE makes cookies the simpler and safer choice, and it still
satisfies "basic JWT". See [ADR-0003](../adr/0003-jwt-in-httponly-cookie.md).

Errors are uniform:

```json
{ "error": { "code": "ITEM_NOT_FOUND", "message": "…", "details": {} } }
```

`400` validation · `401` unauthenticated · `403` not the owner · `404` missing or soft-deleted ·
`409` conflict (already claimed) · `429` rate limited

Auth column below: **—** public · **A** authenticated · **O** owner only

## Auth

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | — | `{ email, password, displayName, inviteCode }` → `{ user, wishlist }`. Creates the default wishlist in the same transaction — a user is never created without one. Sets cookie (register logs you in; no separate login step needed). Rate limited. |
| POST | `/api/auth/login` | — | `{ email, password }` → `{ user }`, sets cookie. Rate limited. |
| POST | `/api/auth/logout` | A | Clears cookie |
| GET | `/api/auth/me` | A | Current user, or 401 |

## Owner data

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/me` | A | **The one aggregate read.** All of the user's lists with their items, joins, and counts, in a single response. |

`GET /api/me` is deliberately the only owner read — it's what the whole owner UI renders from.
It respects `hide_claims_from_owner` per list: for lists with the flag on, claim data is
**stripped server-side** and the response carries no hint that a claim exists. Never send it
and hide it in the client.

## Preview

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/preview` | A | `{ url }` → `{ title, imageUrl, price, currency, siteName, ogStatus }` |

Authenticated on purpose — only logged-in users add items, so the SSRF surface is never exposed
anonymously. Must go through `safe-fetch`. Cached by URL hash. Rate limited per user.

A failed scrape returns `200` with `ogStatus: "failed"` and null fields. It is **not** an error —
the client just shows an empty form.

## Wishlists

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/wishlists` | A | `{ title }` → `201 { wishlist }`, `isDefault: false` always — only registration creates a default list |
| PATCH | `/api/wishlists/:id` | O | `{ title?, hideClaimsFromOwner? }`, at least one required → `{ wishlist }`. The default list may be renamed; only deletion is blocked. |
| DELETE | `/api/wishlists/:id` | O | See below |

`DELETE` on the **default** list always fails: `409 DEFAULT_WISHLIST_UNDELETABLE`, with or without
the query flag.

Otherwise, if any item's only membership across the owner's lists is this one, deleting would
orphan it — the "prompt" behaviour in [data-model.md](data-model.md) § *Deletion semantics*:

- **Without** `?deleteOrphans=true`: `409 CONFIRM_DELETE_ORPHANS`, body carries
  `details.orphanItems: { id, title }[]`, and **nothing is deleted**. The client shows these to
  the user and re-requests with the flag once confirmed.
- **With** `?deleteOrphans=true`: those items are soft-deleted, then the list is deleted → `204`.

A list with no would-be-orphans deletes with a plain `DELETE`, no flag needed. An item that
belongs to this list *and* another is never touched — only its membership here disappears.

## Items

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/items` | A | `{ url, title, notes?, priceAmount?, priceCurrency?, wishlistIds[] }` → `201 { item }`. Every id in `wishlistIds` must be a list the caller owns, or `400 VALIDATION_FAILED` naming the bad ones and creating nothing. |
| PATCH | `/api/items/:id` | O | Any subset of `url, title, notes, priceAmount+priceCurrency` → `{ item }`. `404` for missing **or soft-deleted**. |
| DELETE | `/api/items/:id` | O | Soft delete. Removes **every** `wishlist_items` row for the item, not just one — see § *Deletion semantics* in [data-model.md](data-model.md). |

`priceAmount`/`priceCurrency` travel together — both or neither, on create and on update. Stored
and returned exactly as sent; there's no server-side conversion or derived value
([ADR-0009](../adr/0009-no-currency-conversion.md)).

Changing `url` on `PATCH` resets `ogStatus` to `pending` and clears `ogFetchedAt` — a hook for the
OG scraper (T030–T034), not a live trigger. **That scraper doesn't exist yet.** Until it does,
`imagePath`, `sourceImageUrl`, `siteName`, and price are exactly what the caller sent; nothing
auto-fills from the URL.
| POST | `/api/items/:id/wishlists` | O | `{ wishlistId }` → `201`. Both the item and the target list must be the caller's — `404` if either is genuinely missing/soft-deleted, `403` if either exists but belongs to someone else. `409 ITEM_ALREADY_IN_WISHLIST` if it's already there. |
| DELETE | `/api/items/:id/wishlists/:wishlistId` | O | → `204`. `404 ITEM_NOT_IN_WISHLIST` if that membership doesn't exist. Removing the **last** membership also soft-deletes the item — no confirmation step, unlike deleting a whole wishlist. |

## Public list view

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/w/:slug` | — | One list. Owner identity is not exposed beyond `displayName`. Always includes claim state — visitors need to see what's taken. |
| POST | `/api/w/:slug/items/:itemId/claim` | — | → `{ claimToken }`. `409` if already claimed. Rate limited by IP. |
| DELETE | `/api/w/:slug/items/:itemId/claim` | — | Body `{ claimToken }`. Must match, or be the authenticated claimer. Rate limited. |

The claim routes are scoped under `:slug` deliberately — you cannot claim an item without
knowing the unguessable link it lives behind. That alone eliminates drive-by abuse; rate
limiting handles the rest.

`GET /api/w/:slug` and `GET /api/me` **cannot share a handler.** The public view exposes claims
and hides everything else; the owner view does the reverse. Merging them is how claim data leaks
to the owner.

## Media

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/media/:filename` | — | Stored item images. `Cache-Control: public, max-age=31536000, immutable`. Filename is validated against a strict pattern — never join user input onto a filesystem path. |

## Rate limits

Starting points, tuned after real traffic:

| Endpoint | Limit |
|---|---|
| `POST /api/auth/login` | 10 / 15 min per IP |
| `POST /api/auth/register` | 5 / hour per IP |
| `POST /api/preview` | 30 / hour per user |
| claim / unclaim | 20 / hour per IP, 60 / hour per slug |

Cloudflare WAF rules sit in front of the claim and preview routes as the first line; the
Postgres token bucket is the backstop.
