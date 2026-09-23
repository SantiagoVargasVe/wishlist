---
id: T115
title: "Fix: a replaced item image doesn't show for anyone who already loaded the old one"
epic: E11-post-deploy-ui-polish
status: done
depends_on: [T114]
size: S
---

## Context

If you replace an item's picture from the edit form, by upload or by pasting a URL, anyone who
has already loaded that list keeps seeing the old picture, the owner included. It can stay that
way for up to a year.

### Mechanism (confirmed)

- `storeUploadedItemImage` and `downloadItemImage` in `src/server/og/image.ts` always write
  `{itemId}.webp`. The filename never changes.
- `GET /media/:filename` (`src/app/media/[filename]/route.ts`) is served
  `Cache-Control: public, max-age=31536000, immutable`.
- Next's image optimizer answers `/_next/image?url=/media/...` with
  `public, max-age=31536000, must-revalidate`, and keeps its own on-disk cache keyed by the
  source URL until the container is recreated.

So the URL a card renders never changes when its image does. Browsers and the optimizer both
keep answering from cache.

T114 added `mediaUrl(imagePath)` in `src/lib/media.ts`. It is the only place `/media` URLs are
built, and it appends a global `?v=<MEDIA_VERSION>`. That version busts **every** image after a
bulk rewrite. T114's task file lists this per-item case as out of scope and names `mediaUrl()`
as the seam for fixing it.

Read before starting: [api-contract.md](../../docs/context/api-contract.md) (both the owner and
visitor item shapes change), and T114's task file for the global version.

## Design

**Per-item version: `items.og_fetched_at`.** `recordResult()` in `image.ts` sets it on every
image write, whether uploaded or downloaded, and it only moves forward. The file is written
(rename) *before* the row is updated. A request in between therefore caches the new bytes under
the **old** URL, which is harmless because nothing references that URL again.

**`og_fetched_at` must stop being cleared when the item's URL changes.** `updateItem` sets it to
`null` on a URL change and leaves the image alone. That comes from a "hook for the future
scraper" (T023) that nothing ever consumed. Changing the URL doesn't re-scrape, and T086's
`imageUrl` is how a picture gets replaced. For a cache key, a nullable value that returns to
`null` is not a version: it takes the URL back to a bare `?v=1`, which a browser may already
hold with older bytes. Sequence:

1. Load the list; `x.webp?v=1` is cached.
2. Replace the picture, which moves the URL to `x.webp?v=1&t=…`.
3. Edit the product link, which nulls `og_fetched_at` and takes the URL back to `x.webp?v=1`.
4. The old picture comes back.

`og_status` still resets to `pending` on a URL change, so nothing is lost.

**Wire-stable.** The visitor grid starts from SSR data, where the column is a `Date`. It then
refetches `GET /api/w/:slug` through TanStack Query after every claim, and there the value
arrives as an ISO string. `mediaUrl()` must produce **the same URL from either form**.
Otherwise every claim changes every image URL on the page, and the images reload.

**Keep the global version.** `MEDIA_VERSION` still busts everything after a bulk rewrite that
goes around `recordResult()`, such as T114's packshot backfill. The two versions compose into one
URL: `?v=<global>&t=<per-item>`.

Required, not optional: the per-item version is a required argument to `mediaUrl()`, so a new
caller can't forget it and still typecheck.

## Acceptance criteria

- [x] `mediaUrl(imagePath, version)` returns a different URL when the per-item version changes,
      and still carries the global `MEDIA_VERSION`
- [x] `mediaUrl` returns the same URL for a `Date` and for that `Date`'s ISO string (SSR vs. a
      TanStack Query refetch)
- [x] `mediaUrl` with a `null` version, meaning an item whose image predates this change and was
      never rewritten since, still returns a valid versioned URL
- [x] `PublicVisitorItem` carries `ogFetchedAt`. `PublicItem` already does. api-contract.md
      documents it on both reads and on `/media`
- [x] Both cards (owner `ItemCard`, visitor `VisitorItemCard`), the edit form's current-image
      preview, and `og:image` pass the item's version
- [x] Changing an item's `url` no longer clears `og_fetched_at`. It still resets `og_status` to
      `pending`
- [x] Storing a replacement image advances `og_fetched_at`, pinned by a test on
      `storeUploadedItemImage`
- [x] Tests ship in the same commit; `npm run test:ci` passes

## Verification

- `npm run test:ci` passed: lint, typecheck, 783 tests with coverage thresholds (the DB-backed
  ones against a real `wishlist_test`, not skipped), and `next build`.
- **Optimizer, on a local production build** (`next start`, images directory in a scratch
  folder, a full-bleed 0.78:1 fixture):
  1. First request for `url=/media/<id>.webp?v=1&t=1000` → `200`, `x-nextjs-cache: MISS`, red.
  2. The file was overwritten in place with a blue image. The same URL → `HIT`, **still red**.
     This is the bug: a URL that doesn't move is answered from cache.
  3. `…&t=2000` → `MISS`, blue. This is the fix.

  The optimizer accepted the longer query string, so `images.localPatterns` needs no change.
  The route itself answered `/media/<id>.webp?v=1&t=1000` with
  `public, max-age=31536000, immutable`.
- **End to end:** seeded one item (with `og_fetched_at = 2026-09-23T12:00:00.123Z`) into the
  scratch test database and loaded `/w/<slug>` anonymously. The card's `<img>` requested
  `/_next/image?url=%2Fmedia%2F<id>.webp%3Fv%3D1%26t%3D1790164800123…`, and `og:image` was
  `…/media/<id>.webp?v=1&t=1790164800123`. `GET /api/w/<slug>` returned
  `ogFetchedAt: "2026-09-23T12:00:00.123Z"`, the string a claim's refetch hands the grid. That
  string is the same `1790164800123` ms, so the URL doesn't change after a claim.

## Out of scope

- Content-addressed filenames (`{itemId}-{hash}.webp`). That would work without a query string,
  but it touches the filename pattern, the orphan sweep, the backfill and every stored row, and
  the query string is enough.
- Shortening the `/media` `Cache-Control`. `immutable` is correct once the URL changes whenever
  the bytes do.
- The edit form's refresh timing after a replacement (T081's catch-up refreshes). Unchanged.

## Files likely touched

```
src/lib/media.ts                              per-item version argument
src/lib/media.test.ts
src/server/services/public-wishlist.ts        expose ogFetchedAt
src/server/services/public-wishlist.test.ts
src/server/services/items.ts                  stop clearing og_fetched_at on url change
src/server/services/items.test.ts
src/server/og/image.test.ts                   replacement advances og_fetched_at
src/app/w/[slug]/item-image.tsx               imageVersion prop
src/app/w/[slug]/item-image.test.tsx
src/app/w/[slug]/item-card.tsx
src/app/w/[slug]/item-card.test.tsx
src/app/w/[slug]/visitor-item-card.tsx
src/app/w/[slug]/visitor-item-card.test.tsx   (new)
src/app/w/[slug]/edit-item-form.tsx
src/app/w/[slug]/og-metadata.ts
src/app/w/[slug]/og-metadata.test.ts
docs/context/api-contract.md, docs/context/data-model.md
docs/backend/CLAUDE.md, docs/frontend/CLAUDE.md
```
