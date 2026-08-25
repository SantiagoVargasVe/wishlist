---
id: T084
title: Wishlist selector — replace checkbox list with a Base UI multi-select combobox
epic: E9-post-mvp-ui
status: todo
depends_on: [T053]
size: S
---

## Context

`WishlistCheckboxList` (used by `AddItemForm`) renders one `Checkbox` per wishlist the owner has,
each independently toggled into the `wishlistIds` array field. Requested replacement: a searchable
multi-select combobox, matching
[Base UI's Combobox multiple-select pattern](https://base-ui.com/react/components/combobox#multiple-select).

This mostly matters once an owner has enough lists that a flat checkbox column gets unwieldy — a
combobox adds search/filter and a more compact closed state (selected lists as chips/tags) instead
of every option always being visible.

## Design decisions (none prior — first pass at this component)

**Confirm Base UI's `Combobox` is actually available in the installed version before starting.**
`package.json` currently pins `@base-ui-components/react@^1.0.0-rc.0` (mid-rename to
`@base-ui/react` upstream, per the `npm ci` deprecation warning already showing in this repo) — the
linked docs page reflects Base UI's current/latest release, which may expose a different API
surface than this pinned `rc.0`. Check the actually-installed package's exports for `Combobox`
before assuming the docs example applies verbatim; if the pinned version doesn't have it yet,
that's a real blocker to raise, not something to route around with a different library.

**Keep the same `Controller`-based integration with `wishlistIds`.** The replacement is a drop-in
for `WishlistCheckboxList` — same `control: Control<CreateItemInput>` prop, same `wishlistIds:
string[]` field shape, same `error` display. Nothing about how the parent form
(`add-item-form.tsx`) wires this field should need to change.

**Selected-items chips, not just a comma list** — Base UI's multiple-select pattern renders chosen
options as removable tags inside the trigger; matches the linked reference rather than inventing a
different closed-state presentation.

## Acceptance criteria

- [ ] `WishlistCheckboxList` (or its replacement, reasonably renamed) is a searchable multi-select
      combobox — typing filters the list of wishlists by title
- [ ] Selected wishlists show as removable chips/tags in the closed trigger, matching Base UI's
      multiple-select reference pattern
- [ ] Still wired to `wishlistIds` via the same `Controller` pattern — no change needed in
      `add-item-form.tsx` beyond the import/usage of the new component
- [ ] Keyboard-operable: open, filter, select/deselect, remove a chip, all without a mouse
- [ ] The existing "choose at least one list" validation error still surfaces the same way
- [ ] Tests: filtering narrows the option list, selecting/deselecting updates `wishlistIds`,
      removing a chip deselects that wishlist, the min-1 validation error still renders

## Out of scope

Any change to how wishlists themselves are created/fetched (`PublicWishlist`) — this is a
presentation-layer swap for an existing field, not a data-model change. Applying this same
combobox pattern anywhere else in the app (e.g. a future wishlist-filter multi-select) — one call
site for now.

## Files likely touched

```
src/app/w/[slug]/wishlist-checkbox-list.tsx
src/app/w/[slug]/wishlist-checkbox-list.test.tsx
src/app/w/[slug]/add-item-form.tsx
```
