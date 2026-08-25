---
id: T056
title: Wishlist filter (which list to show — no price filter, see ADR-0009)
epic: E6-frontend
status: done
depends_on: [T055]
size: S
---

## Context

T055 added create/rename/delete but deliberately left navigating *between* lists out of scope —
this task is that switcher. Read [ADR-0009](../../docs/adr/0009-no-currency-conversion.md): the
original T056 was "price + wishlist filters," and the price half was removed entirely (no
cross-currency comparison is meaningful without a real conversion, and a wrong-looking filter is
worse than none). What's left is wishlist-selection only — no backend work, no schema, just a nav
control over data the owner view already has.

## Design decisions (no prior spec existed)

**Plain `<Link>`s, not Base UI's `Tabs` primitive.** Switching lists is real navigation to a
different route (`/w/[slug]`) with its own server-rendered data, not a client-side panel swap
within one page — `Tabs`' ARIA `tablist`/`tabpanel` contract assumes the latter. A `<nav>` of
links with `aria-current="page"` on the active one is the correct semantic for "which page am I
on," and needs no client JS at all — this stays a Server Component.

**Hidden entirely when there's only one list.** A switcher with one, unremovable option (every new
account starts with exactly one wishlist) is a control with nothing to control. Showing it anyway
would be clutter on every account until someone creates a second list.

**Order is stable, not reordered around the current selection.** `wishlists` already arrives
sorted default-first, then by creation order (T025's `getMyWishlists`). Re-sorting to put the
active list first would make the row visibly reshuffle every time you switch — worse for
orientation than a list that never moves.

## Acceptance criteria

- [x] A row of links, one per owned wishlist, appears above the existing header when the owner has
      more than one list; renders nothing when they have exactly one
- [x] The current list is visually distinguished and carries `aria-current="page"`
- [x] Each link points at `/w/{slug}` for that list, in the same order `wishlists` already arrives in
- [x] Tests: hidden at one list, one link per list at two-or-more, correct `aria-current` and `href`
      per list

## Out of scope

Any price/amount filter — removed entirely per ADR-0009, not deferred. Reordering, pinning, or
drag-to-reorder lists — `wishlists`' existing order is authoritative.

## Files likely touched

```
src/app/w/[slug]/wishlist-filter.tsx
src/app/w/[slug]/owner-view.tsx
src/lib/i18n/es.ts
```
