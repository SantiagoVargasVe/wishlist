---
id: T021
title: Create a default wishlist on registration
epic: E3-core-domain
status: done
depends_on: [T011, T020]
size: S
---

## Context

Closes the gap flagged in T011: registration was written before `wishlists` existed, so it could
only consume an invite and create a user. This task extends that same transaction to also create
the user's default list — "both or neither" now covers three things instead of two.

A user with no default list is a broken state: the share CTA in the product spec depends on the
default list existing, and there's no other path that creates one. So this can't be deferred to
first use — it has to happen atomically with account creation.

Read [product.md](../../docs/context/product.md) § *Decisions already made* and
[data-model.md](../../docs/context/data-model.md) § *wishlists*.

## Acceptance criteria

- [ ] `createDefaultWishlist(ownerId, db)` in a new `src/server/services/wishlists.ts` — separate
      from `auth.ts`, which shouldn't own wishlist-creation logic. Takes `DbOrTx` (already defined
      in `db/types.ts`) so it works both standalone and inside another service's transaction.
- [ ] `registerUser`'s transaction calls it after the user insert, using the **same `tx`** — a
      user must never exist without a default list, or vice versa
- [ ] Title is exactly `"Wishlist"`, matching product.md. It's renameable immediately, so this is
      a seed value, not a permanent product decision.
- [ ] `isDefault: true`, slug from `generateSlug()`
- [ ] `registerUser`'s return type gains the created wishlist (id, slug, title, isDefault) so the
      client can redirect straight to `/w/{slug}` without a second round trip. Update
      `api-contract.md` to document the response shape change.
- [ ] `POST /api/auth/register`'s response includes the wishlist
- [ ] Tests: registration creates exactly one default wishlist; a failure anywhere in the
      transaction (duplicate email, lost invite race) leaves **no** wishlist, matching the
      existing "no orphan user" guarantee; the created wishlist satisfies the partial-unique-index
      invariant from T020 (a second call for the same user would violate it — assert that indirectly
      by checking `isDefault` is true and there is exactly one)
- [ ] `npm run test:ci` passes

## Out of scope

Renaming or deleting a wishlist, and blocking deletion of the default one (T022). Non-default
wishlist creation (T022). Any UI.

## Files likely touched

```
src/server/services/wishlists.ts
src/server/services/wishlists.test.ts
src/server/services/auth.ts
src/server/services/auth.test.ts
src/app/api/auth/register/route.ts
docs/context/api-contract.md
```
