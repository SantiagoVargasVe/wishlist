---
id: T054
title: Edit + delete item flows (remove-vs-delete distinction)
epic: E6-frontend
status: done
depends_on: [T053, T023, T024]
size: M
---

## Context

T053 added the only way to *create* an item. This task adds the owner-side ways to change or get
rid of one: edit its fields, unfile it from the current list, or delete it outright. Read
`docs/frontend/CLAUDE.md` § *Delete vs. remove* before touching any of this — it's the one
non-obvious rule the whole task hangs on: "remove from this list" and "delete item" are two
visually distinct actions, not one dialog with a checkbox. `PATCH /api/items/:id`,
`DELETE /api/items/:id`, and `DELETE /api/items/:id/wishlists/:wishlistId` all already exist
(T023, T024) — **no backend work is in scope here**.

## Design decisions (no prior spec existed)

**The owner `ItemCard` changes from "the whole card is one `<a>`" to "the title is the link."**
`VisitorItemCard` (T052) already made this call for the same reason this task now needs it for:
you cannot nest interactive elements (edit/remove/delete buttons) inside an anchor. Mirrors
`VisitorItemCard`'s existing structure exactly, for the same reason.

**Removing from the last list warns; removing from a non-last list doesn't.** Per
`docs/frontend/CLAUDE.md`: "Removing an item from its last list soft-deletes it, so warn in that
case." The API gives no confirmation step either way (that's deliberate on its side — see T024's
own docs), so the frontend is the only place this warning can live. Whether an item is on its
last list is computed client-side from the `wishlists` array T053 already threads through
`OwnerView` — counting how many of the owner's wishlists contain this item's id — rather than
adding a `membershipCount` field to the API response for a single UI decision.

**Deleting outright always confirms, unconditionally.** Unlike "remove," which is only
consequential in the last-list case, "delete" always removes the item from every list it's in —
there's no non-destructive path through this button, so it always asks first.

**A shared `ConfirmDialog` primitive** (`src/app/_ui/confirm-dialog.tsx`) backs both the delete
button and the last-list-removal warning — two call sites in this task, past the "extract on the
second use" bar in design-system.md. It owns its own open state and closes itself once its
`onConfirm` callback resolves; callers catch their own mutation errors and toast them (matching
`ClaimButton`'s existing error-toast pattern) rather than letting a rejection leave the dialog
stuck open.

**A price once set cannot be cleared through this form — and the UI can't even get into a state
that would try.** `updateItemSchema`'s `priceAmount`/`priceCurrency` are `.optional()`, not
`.nullable()` — omitting both means "leave unchanged," and there's no way to say "clear it" over
the wire; that's an existing schema property, not something this task's scope covers changing.
Base UI's `Select` also has no unselect affordance, so once a currency is chosen (either by the
user or by the edit form's own prefill) there's no way to blank it back out — clearing only the
amount field leaves a mismatched pair, which the schema's existing pair-refinement correctly
rejects with an inline error rather than silently submitting a half-cleared price. The "leave both
blank to leave the price alone" case this enables is for an item that has no price yet, where both
fields start genuinely empty — the same "" → `undefined` mapping T053's `PriceFields` already
used. A hint under the field says so explicitly.

**`notes`, unlike price, genuinely can be cleared** — its schema field is `nullable().optional()`.
So the edit form maps a blank notes field to `null` (clear), not `undefined` (leave unchanged) —
the opposite of T053's add form, where every field starts blank and "unchanged" isn't a concept
that exists yet. Same input, different correct mapping, because the two forms mean different
things by "empty."

**`PriceFields` (T053) is now generic over any field-values shape with `priceAmount`/
`priceCurrency`**, instead of copy-pasting a second near-identical block for the edit form. Both
`createItemSchema` and `updateItemSchema` happen to give those two fields the exact same type, so
one component serves both forms with zero changes at either call site — TypeScript infers the
type parameter from what's already passed.

## Acceptance criteria

- [x] Owner `ItemCard`: title is the outbound link (not the whole card); an actions row holds
      Edit / Quitar / Eliminar
- [x] Edit opens a modal prefilled with the item's current `url, title, notes, priceAmount,
      priceCurrency`; submits via `PATCH /api/items/:id`; on success the modal closes and the page
      refreshes (no client cache backs the owner grid — same `router.refresh()` pattern T053 used)
- [x] "Quitar" on a non-last-list item removes it immediately via
      `DELETE /api/items/:id/wishlists/:wishlistId`, no confirmation
- [x] "Quitar" on an item's last remaining list shows a warning dialog explaining this will delete
      the item, before calling the same endpoint
- [x] "Eliminar" always confirms via `ConfirmDialog`, then calls `DELETE /api/items/:id`
- [x] A failed remove/delete shows an error toast and leaves the item exactly where it was —
      never a partial or silently-lost state
- [x] Tests: `ConfirmDialog` (renders trigger, opens, confirms, closes); the last-list membership
      calculation; the edit form's prefill and its price/notes semantics (blank price omits both
      keys, blank notes sends `null`); remove-vs-delete wiring calls the right endpoint

## Out of scope

Creating/renaming/deleting whole wishlists (T055). Any way to clear an already-set price via the
API (would need a schema change — write a new task if this turns out to matter). Undo for a
delete or remove — soft-delete means the data survives in the DB, but nothing here exposes
restoring it.

## Files likely touched

```
src/app/_ui/confirm-dialog.tsx
src/app/w/[slug]/item-card.tsx
src/app/w/[slug]/item-grid.tsx
src/app/w/[slug]/owner-view.tsx
src/app/w/[slug]/item-actions.tsx
src/app/w/[slug]/edit-item-modal.tsx
src/app/w/[slug]/edit-item-form.tsx
src/app/w/[slug]/delete-item-button.tsx
src/app/w/[slug]/remove-from-list-button.tsx
src/app/w/[slug]/price-fields.tsx
src/lib/api/queries.ts
src/lib/i18n/es.ts
```
