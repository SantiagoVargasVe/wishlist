---
id: T094
title: "Fix: new-list nav chips don't appear on the previous list until a reload"
epic: E11-post-deploy-ui-polish
status: done
depends_on: [T055, T056]
size: S
---

## Context

Reported from real usage. `WishlistFilter` (`src/app/w/[slug]/wishlist-filter.tsx`) — the pill
nav at the top of the owner view — renders only when `wishlists.length > 1`. It's a Server
Component, fed from `getMyWishlists` via the `/w/[slug]` page.

Repro: with a single list, create a second one (`CreateWishlistModal`). Its `onSubmit` does
`router.push('/w/<new-slug>')` but **no `router.refresh()`**. The new list's route renders fresh
(2 lists → chips appear). But navigating back to the first list — via a prefetched `<Link>` chip
or the browser back button — serves that route's **stale entry in Next's client Router Cache**,
captured when there was only one list and `WishlistFilter` returned `null`. So the first list
shows no chips until a hard reload busts the cache.

`RenameWishlistModal` already calls `router.refresh()`; `DeleteWishlistButton` does `push` +
`refresh`. The gap is specifically the create flow.

## Acceptance criteria

- [ ] Starting from a single list: creating a second list and then navigating back to the first
      shows the pill nav immediately, with no manual reload
- [ ] The pill nav on the newly created list still shows both lists (no regression)
- [ ] Deleting a list back down to one still hides the nav without a reload (no regression)
- [ ] `router.refresh()` is actually invalidating sibling route segments, not just the current
      one — if `push` then `refresh` doesn't take effect on the destination in testing, fall
      back to `refresh` before `push`, or refresh from the destination
- [ ] Test: `create-wishlist-modal.test.tsx` asserts `router.refresh` is called on a successful
      create (mirroring `rename-wishlist-modal.test.tsx`'s existing refresh assertion)

## Out of scope

`WishlistFilter`'s "hide the nav when there's only one list" rule — that's intended, keep it.
Converting `WishlistFilter` to a client component. TanStack Query's cache (this is Next's Router
Cache — a different layer). Prefetch behavior of the `<Link>` chips.

## Files likely touched

```
src/app/w/[slug]/create-wishlist-modal.tsx
src/app/w/[slug]/create-wishlist-modal.test.tsx
```
