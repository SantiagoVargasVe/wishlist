---
id: T040
title: Claim schema and claim/unclaim endpoints
epic: E5-claims
status: done
depends_on: [T020, T023]
size: M
---

## Context

Anyone holding a list's share link — logged in or not — can mark an item as bought. This is the
one write path open to anonymous visitors.

The core correctness requirement: **two people must never both successfully claim the same item.**
Preventing exactly that duplicate purchase is why the app exists.

Read [data-model.md](../../docs/context/data-model.md) (`item_claims`),
[api-contract.md](../../docs/context/api-contract.md) (claim routes), and the anonymous-claims
section of [security.md](../../docs/context/security.md).

## Acceptance criteria

- [ ] `item_claims` table with a **UNIQUE constraint on `item_id`**, plus migration
- [ ] `POST /api/w/:slug/items/:itemId/claim` → `201 { claimToken }`
- [ ] `DELETE /api/w/:slug/items/:itemId/claim` with `{ claimToken }` in the **body**, never the
      URL — tokens in URLs leak via logs and `Referer`
- [ ] Claim succeeds only if the item is actually in the list identified by `:slug`; otherwise
      `404`. Slug possession is the authorization.
- [ ] Concurrent claims: insert and catch the unique violation → `409`. **No read-then-write** —
      it races, and this is the exact bug the feature prevents.
- [ ] `claimToken` is cryptographically random, ≥128 bits, stored on the row
- [ ] Unclaim succeeds when the token matches, **or** when the authenticated user is
      `claimed_by_user_id`. Otherwise `403`.
- [ ] Logged-in claimers get `claimed_by_user_id` set; anonymous ones get null. Neither is ever
      exposed in a response — visitors see "reserved", never who.
- [ ] Claims survive an item soft-delete (no cascade on `deleted_at`)
- [ ] Test: two simultaneous claims on one item, exactly one gets `201`, the other `409`

## Out of scope

Building the rate-limit *mechanism* (T042, already done) — this task only applies the existing
`policies.claim` to these two routes. `GET /api/w/:slug` (the public read endpoint claim state is
part of) doesn't exist yet either; these routes use a narrow internal lookup, not that endpoint.
Owner-side filtering via `hide_claims_from_owner` (T043), and the localStorage/undo UI (T041).

## Files likely touched

```
src/server/db/schema.ts
src/server/db/migrations/
src/server/services/claims.ts
src/server/services/claims.test.ts
src/server/errors.ts
src/lib/claim-token.ts
src/lib/schemas/claim.ts
src/app/api/w/[slug]/items/[itemId]/claim/route.ts
```
