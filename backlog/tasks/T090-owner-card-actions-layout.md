---
id: T090
title: "Owner item card actions — two-row layout, hide \"Quitar\" for single-list items"
epic: E11-post-deploy-ui-polish
status: done
depends_on: [T054, T080]
size: S
---

## Context

Reported from real usage of the owner view. `ItemActions`
(`src/app/w/[slug]/item-actions.tsx`) renders three buttons in a `flex flex-wrap gap-2` row:

- **Editar** — `EditItemModal`
- **Quitar** — `RemoveFromListButton` (remove from *this* list)
- **Eliminar** — `DeleteItemButton` (soft-delete from every list)

Two problems:

1. On desktop the three buttons have different intrinsic widths and wrap raggedly — "kind of a
   mess with the width of the buttons".
2. When an item belongs to only one list, "Quitar" and "Eliminar" do the same thing — removing
   the last list membership soft-deletes the item (`docs/frontend/CLAUDE.md` § "Delete vs.
   remove", enforced by T024's last-list rule). Showing both is confusing.

**This is frontend-only, despite looking like it needs membership data from the server.**
`ItemGrid` (`src/app/w/[slug]/item-grid.tsx`) already computes `membershipCount` per item from
the `wishlists` prop it holds — it has to, to pass `isLastList = membershipCount <= 1` down to
`RemoveFromListButton` for its last-list confirmation. So "is this item in more than one list"
is already known at the point the button is rendered; no API or service change is needed.

## Target layout

`Button` is `inline-flex`, so each button needs `w-full` (or a grid cell) to stop rendering at
content width. A 2-column grid expresses both cases cleanly:

- **Item in exactly one list** (`isLastList === true`): no "Quitar". Row 1 `Editar` full width,
  row 2 `Eliminar` full width.
- **Item in more than one list** (`isLastList === false`): row 1 is `Editar` + `Quitar` at equal
  width with the gap between them, row 2 `Eliminar` full width on its own.

## Acceptance criteria

- [ ] `RemoveFromListButton` ("Quitar") renders only when the item is in **more than one** list;
      it is absent for a single-list item
- [ ] Single-list item: exactly two buttons — `Editar` then `Eliminar` — each full width, stacked
- [ ] Multi-list item: `Editar` and `Quitar` share one row at equal width; `Eliminar` is full
      width on the row below
- [ ] No action button renders at its intrinsic content width — no ragged wrapping at 375px,
      768px, or 1280px (verify in a browser)
- [ ] `isLastList` is still passed through to `RemoveFromListButton` (its last-list confirmation
      copy path is not deleted as part of this task — see below)
- [ ] Tests (`item-actions` / `item-grid` / `remove-from-list-button` as appropriate): a
      single-list item renders no "Quitar"; a multi-list item renders all three; existing
      `RemoveFromListButton` behavior tests still pass

## Implementation note

Gating "Quitar" on `!isLastList` makes the last-list branch of `RemoveFromListButton` (the
"esta es la única lista… quitarlo lo eliminará por completo" confirm dialog) unreachable *from
this UI* — the only time it fires is when the button is now hidden. Leave that branch in place
for this task (it stays covered by `remove-from-list-button.test.tsx` in isolation); a follow-up
can simplify `RemoveFromListButton` if we're sure nothing else will ever render it with
`isLastList`. Don't grow this task into that rewrite.

## Out of scope

`RemoveFromListButton`'s internal last-list confirmation logic (see note above). The visitor
card's claim button (T096). `DeleteItemButton`'s confirm dialog. Adding a real per-item
membership field to the API.

## Files likely touched

```
src/app/w/[slug]/item-actions.tsx
src/app/w/[slug]/item-actions.test.tsx        (new, if not present)
src/app/w/[slug]/item-grid.tsx                 (only if the gate is computed here)
src/app/w/[slug]/item-grid.test.tsx
```
