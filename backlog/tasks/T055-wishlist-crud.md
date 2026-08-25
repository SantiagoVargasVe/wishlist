---
id: T055
title: Create / rename / delete wishlist
epic: E6-frontend
status: done
depends_on: [T051, T022]
size: M
---

## Context

The owner view has only ever rendered one wishlist. This task adds the three ways to manage the
*set* of lists: create a new one, rename one, delete one. `POST /api/wishlists`,
`PATCH /api/wishlists/:id`, and `DELETE /api/wishlists/:id` all already exist (T022) — **no
backend work is in scope here**. Read [data-model.md](../../docs/context/data-model.md) §
*Deletion semantics* for the exact rules this UI has to respect, especially the "prompt about
orphaned items" behavior on delete.

## Design decisions (no prior spec existed)

**No list switcher yet — that's T056's job, not this one.** T056 is explicitly "Wishlist filter
(which list to show)"; this task only adds the CRUD actions themselves. Create redirects straight
to the new list (`router.push`); delete redirects to the default list, since the page being
deleted stops existing. Neither needs a switcher to be useful on its own, and building one here
would be scope creep into a task that already exists.

**The default list shows no delete button at all**, rather than a disabled one or one that always
errors. `DELETE /api/wishlists/:id` unconditionally 409s (`DEFAULT_WISHLIST_UNDELETABLE`) for the
default list — showing an affordance that can never succeed is worse than not showing it.
Renaming, by contrast, works for every list including the default one, so that button always
shows.

**Delete is a bespoke two-phase dialog, not a `ConfirmDialog` (T054).** The orphan-item prompt
(data-model.md's own wording) can't be known until the first `DELETE` attempt responds — a plain
`ConfirmDialog` has one static description and closes on any resolved `onConfirm`, which doesn't
fit "stay open, but now show *these specific items* and ask again with `?deleteOrphans=true`."
Forcing that shape into `ConfirmDialog` would mean teaching a generic primitive about one caller's
orphan-list concept. The dialog: attempt a plain delete → on `CONFIRM_DELETE_ORPHANS`, list the
named items from `error.details.orphanItems` and swap the confirm button to re-attempt with the
flag → on any other error, close and toast.

**Renaming reuses `createWishlistSchema`, not `updateWishlistSchema`,** for the form's
`zodResolver`. The two schemas validate `title` identically (`trim().min(1).max(120)`) —
`updateWishlistSchema` only differs by making it optional and adding an "at least one field"
refine, both irrelevant here since this form always submits a title. Reusing the create schema
avoids a pointless `.refine` for a form that only ever has one field.

## Acceptance criteria

- [x] "Nueva lista" opens a create modal (title only); on success, navigates to the new list
- [x] Every list — including the default — has a "Renombrar" action; on success the page refreshes
      with the new title
- [x] Non-default lists have an "Eliminar lista" action; the default list has none
- [x] Deleting a list with no solely-owned items succeeds immediately and redirects to the default
      list
- [x] Deleting a list that would orphan items shows those items by name and requires a second
      confirmation before soft-deleting them and the list together
- [x] A failed create/rename/delete shows a form error or toast; nothing navigates or refreshes on
      failure
- [x] Tests: create/rename happy path + server error; the delete dialog's plain-success path, its
      orphan-prompt path (including the second confirmation actually sending
      `?deleteOrphans=true`), and its plain-error path; the default list rendering no delete button

## Out of scope

The list switcher / filter UI (T056) — no navigation exists yet to see a second list without
typing its URL. `hideClaimsFromOwner` toggling (T043 hasn't landed the data this would control).

## Files likely touched

```
src/app/w/[slug]/create-wishlist-modal.tsx
src/app/w/[slug]/rename-wishlist-modal.tsx
src/app/w/[slug]/delete-wishlist-button.tsx
src/app/w/[slug]/owner-view.tsx
src/lib/api/queries.ts
src/lib/i18n/es.ts
```
