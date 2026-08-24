---
id: T024
title: Add/remove an item to/from an additional list, with the last-list rule
epic: E3-core-domain
status: done
depends_on: [T022, T023]
size: S
---

## Context

`POST /api/items/:id/wishlists`, `DELETE /api/items/:id/wishlists/:wishlistId`.

T023's `DELETE /api/items/:id` is the *blunt* path — it always removes every membership and
soft-deletes the item, regardless of how many lists it was in. This task is the *surgical* path:
touch one membership at a time. The two exist as separate endpoints precisely so a client can
distinguish "take this off my birthday list, it's still on my main one" from "get rid of this
item everywhere" — the same distinction [data-model.md](../../docs/context/data-model.md) calls
out as needing to look different in the UI.

Read [data-model.md](../../docs/context/data-model.md) § *Deletion semantics* and
[api-contract.md](../../docs/context/api-contract.md) § *Items*.

## Acceptance criteria

- [ ] `POST /api/items/:id/wishlists` — `{ wishlistId }` → `201`. Owner only on **both** the item
      (`404` if missing/soft-deleted/not yours) and the target list (reuses `assertOwned` +
      `WishlistErrors.notFound`, same as every other owner-only lookup — no new ownership logic).
- [ ] Adding an item to a list it's already in → `409`, not a silent no-op or a duplicate row.
      `wishlist_items`' composite primary key (T020) is the backstop if this is ever skipped.
- [ ] `DELETE /api/items/:id/wishlists/:wishlistId` — owner only on the item. `404` if the
      membership doesn't exist (item not actually in that list) — distinct from the item itself
      being missing, which is also `404` but via `ItemErrors.notFound`.
- [ ] **The last-list rule:** removing the item's only remaining membership also soft-deletes the
      item, so nothing lands with zero list memberships — "nothing lands in orphan limbo" per
      data-model.md. Join-row delete, membership count, and conditional soft-delete happen in
      **one transaction**.
- [ ] Removing from a list that isn't the item's last one only removes that join row — the item,
      and its membership in every other list, is untouched. No confirmation step here, unlike
      `DELETE /api/wishlists/:id` — this is one item, one explicit action the caller chose,
      not a bulk operation with a surprising blast radius.
- [ ] Tests: add to a second owned list; reject adding to an unowned/nonexistent list; reject a
      duplicate add; remove from one of several lists — item and other memberships survive;
      remove the last membership — item soft-deleted; removing a membership that doesn't exist is
      `404`; both endpoints `403` for an item that genuinely exists but belongs to someone else,
      matching the `assertOwned` split from T022 — `404` is reserved for truly absent; `npm run test:ci` passes

## Out of scope

The blunt `DELETE /api/items/:id` path (T023, already done). `GET /api/me` (T025). Any UI.

## Files likely touched

```
src/server/errors.ts
src/server/services/items.ts
src/server/services/items.test.ts
src/app/api/items/[id]/wishlists/route.ts
src/app/api/items/[id]/wishlists/[wishlistId]/route.ts
```
