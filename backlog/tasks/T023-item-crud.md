---
id: T023
title: Item CRUD with soft delete
epic: E3-core-domain
status: done
depends_on: [T020, T022]
size: M
---

## Context

`POST /api/items`, `PATCH /api/items/:id`, `DELETE /api/items/:id`. Pure manual CRUD — the OG
scraper (T030–T034) doesn't exist yet, so there's nothing to auto-fill title, image, or price from
a pasted URL. Every field here comes from what the caller sends.

Reuses T022's ownership primitives (`requireUserId`, `assertOwned`) — no new auth infrastructure
needed, which is exactly why those were built generically instead of wishlist-specific.

Price and currency are stored exactly as entered, with no derived conversion — see
[ADR-0009](../../docs/adr/0009-no-currency-conversion.md). An earlier draft of this task computed
a USD snapshot at write time; that was removed before merging once it became clear two items
saved months apart would be converted at two different rates, making the comparison it existed for
invalid from the start.

Read [data-model.md](../../docs/context/data-model.md) § *items* and § *Money*, and
[api-contract.md](../../docs/context/api-contract.md) § *Items*.

## Acceptance criteria

- [ ] `POST /api/items` — `{ url, title, notes?, priceAmount?, priceCurrency?, wishlistIds[] }` →
      `201`. `wishlistIds` must be non-empty and every id must be a list the caller **owns** —
      filing an item into someone else's list, or into nothing, isn't representable.
- [ ] Item row and its `wishlist_items` rows are created in **one transaction**.
- [ ] Price and currency are provided together or not at all — enforced by the shared Zod schema
      (`src/lib/schemas/item.ts`), with the database's own CHECK constraint (T020) as the backstop
      if the service is ever called with unvalidated input. Stored exactly as sent.
- [ ] `PATCH /api/items/:id` — owner only, `404` for missing **or soft-deleted**. Any subset of
      `url`, `title`, `notes` (nullable, to clear it), `priceAmount` + `priceCurrency` together.
- [ ] Changing `url` resets `og_status` to `pending` and clears `og_fetched_at` — signalling "needs
      a fetch," not actually triggering one, since nothing can fetch anything yet. This is the hook
      T031–T034 attach to, not a live call.
- [ ] `DELETE /api/items/:id` — owner only, soft delete. Per
      [data-model.md](../../docs/context/data-model.md)'s deletion table this is the *direct*
      delete path: it removes **every** `wishlist_items` row for the item, regardless of how many
      lists it was in, in the same transaction as the soft delete. This is deliberately blunter
      than T024's per-list removal, which only ever touches one join row.
- [ ] Tests: create with valid/owned lists; reject an unowned or nonexistent wishlist id; price and
      currency round-trip exactly as entered, in both COP and USD; rename; clear notes; url change
      resets `og_status`; unrelated field change doesn't; 404 on unknown and on soft-deleted; 403 on
      non-owner; delete removes all join rows, not just one; delete is final — deleting twice is a
      404, not a silent success
- [ ] `npm run test:ci` passes

## Out of scope

Adding/removing an item to/from an *additional* list, and the last-list soft-delete rule (T024).
The OG scraper itself (T030–T034) — this task only leaves the hook. `GET /api/me` (T025). Any
cross-currency conversion or price filtering — deliberately not part of this product, see
[ADR-0009](../../docs/adr/0009-no-currency-conversion.md).

## Files likely touched

```
src/lib/schemas/item.ts
src/server/errors.ts
src/server/services/items.ts
src/server/services/items.test.ts
src/app/api/items/route.ts
src/app/api/items/[id]/route.ts
```
