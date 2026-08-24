---
id: T022
title: Wishlist CRUD with default-list protection and orphan-item confirmation
epic: E3-core-domain
status: done
depends_on: [T020, T021]
size: M
---

## Context

`POST /api/wishlists`, `PATCH /api/wishlists/:id`, `DELETE /api/wishlists/:id`.

**Folds in T013's scope**, which was never built as its own task. PATCH/DELETE are the first
owner-only ("O") endpoints in the app, and there is no functional way to implement "only the
owner may do this" without a session guard and an ownership-check pattern — this isn't optional
work being pulled forward, it's a hard dependency T022 cannot ship without. The two primitives are
small and generically reusable (T023 needs the identical pattern for items), so they're built here
rather than blocking on a separate PR.

Read [api-contract.md](../../docs/context/api-contract.md) § *Wishlists* and
[data-model.md](../../docs/context/data-model.md) § *Deletion semantics*.

## Acceptance criteria

**Session / ownership (T013's scope)**
- [ ] `requireUserId()` in `src/server/auth/session.ts` — wraps `currentUserId()`, throws
      `UnauthorizedError` when absent. Refactor `GET /api/auth/me` to use it, removing the
      duplicated null-check that route already had.
- [ ] `assertOwned(resource, userId, notFoundError)` in `src/server/auth/ownership.ts` — generic
      over any `{ ownerId: string }` row. Throws the caller-supplied `NotFoundError` when the
      resource is missing, `ForbiddenError` when it exists but belongs to someone else, otherwise
      narrows and returns it. Matches the documented status split: **404 truly missing, 403 exists
      but not yours** — api-contract.md already specifies this split, this task is what implements it.

**Wishlists**
- [ ] `POST /api/wishlists` — `{ title }` → `201` with the created wishlist. `isDefault: false`
      always; only registration (T021) creates a default.
- [ ] `PATCH /api/wishlists/:id` — `{ title?, hideClaimsFromOwner? }`, at least one field required.
      Owner only. The **default wishlist can be renamed** — no special case blocks that, only
      deletion is blocked.
- [ ] `DELETE /api/wishlists/:id` — owner only.
      - Deleting the **default** wishlist → `409 DEFAULT_WISHLIST_UNDELETABLE`, always, regardless
        of the query flag.
      - If any item's **only** membership (across all the owner's lists) is this wishlist, and
        `?deleteOrphans=true` was **not** passed → `409 CONFIRM_DELETE_ORPHANS` with the affected
        items' ids and titles in `details`, and **nothing is deleted**. This is the "prompt" the
        data model doc describes — api-contract.md gets updated to spell out this response shape,
        since the current entry only documents the success path.
      - With `?deleteOrphans=true` → those items are **soft-deleted**, then the wishlist is
        deleted (`wishlist_items` rows cascade). `204` on success.
      - An item that belongs to this list *and* another is unaffected — only the join row for
        this list disappears.
- [ ] Ownership check happens **inside the service**, not the route — matches the convention in
      `docs/backend/CLAUDE.md`.
- [ ] Tests: create; rename (including renaming the default); toggle `hideClaimsFromOwner`; update
      with an empty body rejected; update/delete by a non-owner → `403`; update/delete of an
      unknown id → `404`; delete the default → `409`; delete with orphan items and no flag → `409`
      listing them, nothing deleted; delete with the flag → items soft-deleted and wishlist gone;
      delete a list where every item also lives elsewhere → succeeds with no flag needed
- [ ] `npm run test:ci` passes

## Out of scope

Item CRUD (T023). Adding/removing an item to/from a list (T024). `GET /api/me` (T025).

## Files likely touched

```
src/server/auth/session.ts
src/server/auth/ownership.ts
src/server/errors.ts
src/lib/schemas/wishlist.ts
src/server/services/wishlists.ts
src/server/services/wishlists.test.ts
src/app/api/wishlists/route.ts
src/app/api/wishlists/[id]/route.ts
src/app/api/auth/me/route.ts
docs/context/api-contract.md
```
