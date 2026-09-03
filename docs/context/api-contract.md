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
| POST | `/api/auth/forgot-password` | — | `{ email }` → **`202`, always**, with an empty body. Rate limited per IP **and** per address. |
| POST | `/api/auth/reset-password` | — | `{ token, password }` → `204`. Does **not** set a cookie. Rate limited per IP. |
| POST | `/api/auth/verify-email` | — | `{ token }` → `204`. Marks the address verified. Rate limited per IP. |
| POST | `/api/auth/resend-verification` | A | `204`. Mints a fresh verification token, invalidating the caller's outstanding one. Rate limited per **user**. |

### Password reset

`/api/auth/forgot-password` returns the **same 202 with the same empty body** for every outcome:
registered address, unknown address, unverified address, mail send failure. Any branch a client
can observe is an account-enumeration oracle, so the handler has one return statement and the
service throws nothing.

Three distinct things silently produce no mail — **unknown**, **unverified**
([ADR-0013](../adr/0013-email-verification-gates-recovery.md)), and **send failure** — and the
server log is the only way to tell them apart, so each logs distinctly. When mail is unconfigured
the token is still minted and the log names `npm run reset-link`, which is the supported delivery
path in that configuration ([ADR-0011](../adr/0011-outbound-email-via-smtp.md)).

Two rate-limit buckets, and either alone can refuse the request: per IP stops a spray across many
accounts, per submitted address stops mailbombing one person's inbox from many addresses. The
address bucket is keyed on a lowercased hash — lowercased because `users.email` is `citext`, so
bucketing the raw string would let anyone reset the cap by changing capitalisation.

`/api/auth/reset-password` returns `204` and **deliberately does not set a session cookie**, where
register and login both do. A reset link arriving in a mailbox is not proof of session intent, and
the user has just proven they can type the new password. Consuming a token also bumps
`users.sessions_valid_from`, so every existing session on that account ends immediately (T104).

Invalid, expired, already-used and wrong-purpose tokens are one `400 RESET_TOKEN_INVALID`. The
password is held to registration's rules by reusing that schema, never by restating them.

### Email verification

Registration sends a verification mail **after** its transaction commits, and the account is
usable immediately. A mail failure — or no mail configuration at all — never fails a
registration: the user is registered, logged in, and unverified.

`/api/auth/verify-email` is deliberately **unauthenticated**. Someone opening a link from their
mailbox on another device has no session, and requiring one would defeat the point; possession of
the token is the permission, which is why the route carries its own rate limit
([ADR-0013](../adr/0013-email-verification-gates-recovery.md)).

Invalid, expired, already-used and **wrong-purpose** tokens all return the same
`400 VERIFICATION_TOKEN_INVALID`. Reset and verification tokens share one table with a `purpose`
discriminator, and the purpose is part of the claim's `WHERE` clause rather than a check
afterwards — so a reset token presented here is not found at all, and a verification token
presented to `/api/auth/reset-password` fails the same way. Neither can ever be spent as the
other.

**Verification gates exactly one thing**, and it is not this route: `/api/auth/forgot-password`
sends nothing to an unverified address. Not login, not any other endpoint. Blocking login would
lock out every existing account on deploy and make outbound mail a hard dependency, contradicting
[ADR-0011](../adr/0011-outbound-email-via-smtp.md). A verification check appearing anywhere else
is a bug.

## Owner data

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/me` | A | **The one aggregate read.** `200 { wishlists: [{ id, slug, title, isDefault, hideClaimsFromOwner, items: [...] }] }`. `401` if not logged in. |

Not `/api/auth/me` (identity, T012) — this one never returns user info, only the wishlist
aggregate. `GET /api/me` is deliberately the only owner read; it's what the whole owner UI renders
from, and it's **one join query**, not one round trip per wishlist. Default list sorts first; an
item belonging to several lists appears once **under each** — that's the correct shape for a UI
that renders one wishlist's items at a time, not a duplication bug.

Once claims exist (T040), it will respect `hide_claims_from_owner` per list: for lists with the
flag on, claim data will be **stripped server-side** and the response will carry no hint that a
claim exists. Never send it and hide it in the client. **Not implemented yet** — there is no claim
data anywhere in today's response, not even a placeholder.

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
| POST | `/api/items/:id/image` | O | Raw image bytes as the body → `204`. Replaces the item's picture. `413 IMAGE_TOO_LARGE` over `IMAGE_MAX_UPLOAD_BYTES`, `400 VALIDATION_FAILED` if the bytes aren't a supported image. |

`PATCH /api/items/:id` also accepts `imageUrl`, which replaces the picture by *downloading* it —
the same unawaited path create uses. `POST .../image` is the other half: bytes the user supplied
directly, whether picked, dragged, or pasted from the clipboard.

**Raw body, not `multipart/form-data`.** There is one field, and `request.formData()` buffers the
whole payload before anything can measure it — which is the denial of service, not the defence.
The body is read through a streaming cap that aborts mid-upload, and `Content-Length` is treated
as a claim rather than a fact. Ownership is checked *before* the body is read, so an upload from a
stranger costs one indexed lookup instead of megabytes of memory.

Uploaded bytes are validated by **decoding**, never by the declared `Content-Type` or a file
extension, and the decoded format must be in a raster allowlist — see
[security.md](security.md) § *Images*.

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

No Cloudflare WAF/rate-limiting layer in front of these — that turned out to be a paid-plan
feature (checked 2026-08-25). The Postgres token bucket above is the only line of defense, not a
backstop to one. See [security.md](security.md)'s "Known accepted risks."
