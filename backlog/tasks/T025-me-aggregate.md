---
id: T025
title: GET /api/me — the one aggregate owner read
epic: E3-core-domain
status: done
depends_on: [T022, T023, T024]
size: M
---

## Context

`GET /api/me`. Every one of the owner's wishlists, each with its live items nested inside —
what the entire owner UI renders from. Deliberately the *only* owner read; see
[api-contract.md](../../docs/context/api-contract.md) and
[architecture.md](../../docs/context/architecture.md).

**Claims are out of scope here, not just unhandled.** `item_claims` (T040) and the
`hide_claims_from_owner` server-side stripping (T043) don't exist yet, so there is nothing to
strip. This task must not fabricate a placeholder claim field — a `claimed: false` on every item
would *look* like the feature works and quietly lie once T040 lands. The hook for T043 is a code
comment, not a stub value.

This is `/api/me`, not `/api/auth/me` (T012) — separate endpoints, separate concerns. This one
never returns user identity; call `/api/auth/me` for that.

Read [data-model.md](../../docs/context/data-model.md) and
[backend/CLAUDE.md](../../docs/backend/CLAUDE.md) § *Queries* — "one aggregate query, not N+1
across lists" is the acceptance bar, not a suggestion.

## Acceptance criteria

- [ ] `GET /api/me` → `200 { wishlists: [{ id, slug, title, isDefault, hideClaimsFromOwner,
      items: [...] }] }`. `401` if not logged in.
- [ ] **One query**, not one-per-wishlist: a single join across `wishlists` → `wishlist_items` →
      `items`, grouped into the nested shape in application code.
- [ ] A wishlist with zero items still appears, with `items: []` — a `LEFT JOIN`, not an inner one.
- [ ] Soft-deleted items never appear. Reuses `liveItem` in the join condition, same as every
      other item read.
- [ ] An item belonging to multiple lists appears once **under each list it belongs to** — this
      is the correct, expected shape for a UI that renders one wishlist's items at a time, not a
      duplication bug.
- [ ] Reuses `wishlists.ts`'s and `items.ts`'s existing column selections (exported, not
      hand-duplicated) so "what's safe to expose" has one source of truth — a field added to one
      of those and forgotten here would otherwise be a silent leak.
- [ ] Default wishlist sorts first; items within a list order by `position` then `added_at`,
      setting up manual reordering later even though nothing sets a non-zero `position` yet.
- [ ] Tests: empty account still returns the default wishlist with `items: []`; an item in two
      lists appears under both; a soft-deleted item never appears; verify via query count/plan
      that this is genuinely one query, not N+1
- [ ] `npm run test:ci` passes

## Out of scope

Any claim data or `hide_claims_from_owner` filtering (T040, T043). Pagination — nobody has enough
items for it to matter yet. Any UI.

## Files likely touched

```
src/server/services/wishlists.ts   # export wishlistColumns
src/server/services/items.ts       # export itemColumns
src/server/services/me.ts
src/server/services/me.test.ts
src/app/api/me/route.ts
```
