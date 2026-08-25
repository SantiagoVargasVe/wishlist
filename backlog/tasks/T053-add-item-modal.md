---
id: T053
title: Add-item modal with live OG preview
epic: E6-frontend
status: done
depends_on: [T032, T023]
size: M
---

## Context

The first real write path in the owner UI. Everything before this task (T050-T052) was
read-only — this is what turns the app into something a user can actually use, not just an API
verified by hand. Read [design-system.md](../../docs/frontend/design-system.md) before writing
any component, and `docs/frontend/CLAUDE.md` § *Adding an item*, which already specifies the exact
flow this task implements. `POST /api/items` and `POST /api/preview` both already exist
(T023, T032) — **no backend work is in scope here**, this is wiring a form to endpoints that work.

## Design decisions (no prior spec existed)

**The scraped image is shown live in the modal but never submitted.** `createItemSchema` has no
`imageUrl` field — only `url, title, notes, priceAmount, priceCurrency, wishlistIds`. T032's own
scope note says image *download* is T033's job, which doesn't exist yet. So the preview thumbnail
is purely a confidence signal ("yes, this is the right product") while the item is being added;
every item card keeps showing its placeholder until T033 lands and a real `image_path` exists.
Prefilling `imageUrl` into a field that gets silently dropped by the API would be worse than not
showing it at all.

**The preview fetch is a `useQuery`, not a `useMutation`.** It's semantically a GET-shaped read (a
scrape result for a given URL) even though the wire method is `POST` — modeling it as a query
gets automatic dedup/caching by URL for free (retyping the same link, or reopening the modal with
the same URL, doesn't re-fire the request) and a natural `isFetching` for the skeleton state.
`enabled` is gated on the debounced value passing `previewSchema` itself, not just "non-empty" —
firing on every keystroke of a partial URL would spam `/api/preview`'s rate limit for nothing.

**Prefill only fires once per resolved URL**, tracked by a ref, not on every render. Without that
guard, a user who prefills from a scrape and then *deliberately edits* the title would have it
silently overwritten again by a `staleTime`-driven refetch or a re-render — the scrape is a
one-time suggestion, not a value the form keeps re-asserting over the user's own edit.

**The owner view moved from single-wishlist to all-wishlists.** `page.tsx` previously fetched
`getMyWishlists` and threw away every wishlist except the one matching the current slug — fine
when the page was read-only, but the "which lists does this belong to" checkbox list (per
`docs/frontend/CLAUDE.md`) needs the full set. `findOwnedWishlist(slug)` became
`findOwnedWishlists()` (no arg, still `cache()`-wrapped so `generateMetadata` and the page body
still share one query), with the slug match now done by the caller.

**No client-side cache to invalidate on success.** The owner view is still server-rendered — there
is no `useQuery` backing the item grid the way the visitor view has one. Same pattern
`RegisterForm` already uses for a server-state-changing action from a client component:
`router.refresh()` after a successful create, not a query invalidation.

## Acceptance criteria

- [x] "Añadir artículo" trigger in the owner view opens a modal (full-screen sheet under 768px,
      per `Dialog` primitive's existing responsive behavior)
- [x] Pasting a URL fires `POST /api/preview` after a debounce, shows a loading state, then
      prefills title/price/currency (never overwrites a field the user already edited) and shows
      the scraped image + site name as a live preview only
- [x] A failed scrape (`ogStatus: "failed"`) never blocks or disables submission — every field
      stays editable and empty is a normal state, not an error banner (root CLAUDE.md
      non-negotiable #2)
- [x] Title, notes, price+currency are editable fields; price/currency travel together, matching
      `createItemSchema`'s pairing rule
- [x] Checkbox list of the caller's own wishlists, defaulting to the current one, `min(1)`
      enforced client-side (schema) and server-side (existing)
- [x] Submit calls `POST /api/items`; on success the modal closes, the form resets, and the page
      refreshes so the new item appears in the (server-rendered) grid
- [x] Tests: the debounce hook in isolation; the preview-prefill hook (fires once per URL, doesn't
      clobber a user edit); the checkbox list toggles the right id in/out of the array; form
      submission happy path and a server-error path

## Out of scope

Editing or deleting an existing item (T054) — this is create-only. Creating a new wishlist from
inside the modal (T055) — the checkbox list only shows lists that already exist. Downloading the
scraped image to disk (T033).

## Files likely touched

```
src/lib/hooks/use-debounced-value.ts
src/lib/api/keys.ts
src/lib/api/queries.ts
src/app/w/[slug]/page.tsx
src/app/w/[slug]/owner-view.tsx
src/app/w/[slug]/add-item-modal.tsx
src/app/w/[slug]/add-item-form.tsx
src/app/w/[slug]/item-preview-field.tsx
src/app/w/[slug]/wishlist-checkbox-list.tsx
src/app/w/[slug]/hooks/use-item-preview.ts
src/lib/i18n/es.ts
```
