---
id: T033
title: Image download pipeline and /media serving
epic: E4-og
status: done
depends_on: [T030, T023]
size: M
---

## Context

Product images are downloaded and stored rather than hotlinked, so cards survive delisted
listings, rotated CDN paths, and `Referer`-based hotlink blocking. The reasoning — including why
a cron that refreshes hotlinks was rejected — is in [ADR-0004](../../docs/adr/0004-store-images.md).

Images live at `data/images/{item_id}.webp`, bind-mounted into the container. The volume is not
backed up, so `source_image_url` must be preserved on every row — it's the only way to rebuild a
lost image for a listing that's still live.

Every knob this task needs was already provisioned in `config.schema.ts` ahead of time —
`IMAGE_STORAGE_PATH`, `IMAGE_MAX_WIDTH` (800), `IMAGE_WEBP_QUALITY` (80), `OG_MAX_IMAGE_BYTES`
(10MB) — so nothing here invents a new magic number; it's all `config.*`.

## Design decisions (no prior spec existed)

**The trigger lives in the route handler, not inside `createItem()`.** Services in this codebase
are tested against a real Postgres DB with no network involved (testing.md's own rule: "never hit
the network in tests"). Firing an unawaited `safeFetch` from inside `createItem()` would mean
every existing `items.test.ts` case creates a real item and, as a side effect, kicks off a real
(or accidentally-real-if-unmocked) network call. `POST /api/items` calls `createItem()`, then —
only if the input carried an `imageUrl` — fires `downloadItemImage()` unawaited. The service stays
exactly as testable as it was; the network-touching piece has its own dedicated test file.

**`createItemSchema` gains an optional `imageUrl`, and the add-item form now actually sends it.**
T053 deliberately *didn't* submit the scraped image ("shown live in the modal but never
submitted") because nothing existed to download it — that constraint is gone now. The image shown
during preview is the same URL saved as `source_image_url` and handed to `downloadItemImage()`.

**`og_status` becomes this item's "did the image finish" signal, for items that had a URL to try.**
`createItem()` doesn't set it — it stays at the column's own default (`pending`), same as today.
`downloadItemImage()` flips it to `ok` (with `og_fetched_at`) on success or `failed` on any
failure. An item created with no `imageUrl` at all just stays `pending` forever, same as every
item today — not a regression, since nothing currently sets it either.

**Editing an item's `url` does not re-trigger a download.** `updateItem()` already resets
`og_status` to `pending` on a URL change (T023) as a documented hook for "whatever scraper shows
up later" — but the edit form (T054) never runs a preview scrape the way the add form does, so
there is no new `imageUrl` to act on at edit time. Wiring re-scrape-on-edit is a real feature, not
a one-line addition, and belongs in its own task if it's wanted.

**Filename validation is a small exported pure function** (`isValidImageFilename`), not inlined in
the route. No `route.ts` in this repo has a dedicated test file — services carry the tested logic,
routes stay thin — so the one genuinely security-sensitive piece of `/media/:filename` (rejecting
anything that isn't exactly `{uuid}.webp` before it ever reaches the filesystem) lives in
`image.ts` next to `downloadItemImage`, where it's a normal unit-tested function.

## Acceptance criteria

- [x] `downloadItemImage(itemId, sourceUrl)` in `src/server/og/image.ts`
- [x] Fetches **through `safeFetch`** with `image/*` content-type and `config.OG_MAX_IMAGE_BYTES`
      — the image URL comes from scraped HTML and is exactly as untrusted as the page URL
- [x] `sharp`: resize to `config.IMAGE_MAX_WIDTH` wide (no upscaling), convert to webp
      `config.IMAGE_WEBP_QUALITY`, strip EXIF (sharp's default when `.withMetadata()` is never called)
- [x] Writes `{IMAGE_STORAGE_PATH}/{item_id}.webp`; sets `image_path` and preserves
      `source_image_url`
- [x] Runs async after the item row is created — a slow retailer CDN must never delay the save
- [x] Failure sets `og_status` to `failed` and leaves `image_path` null. Not an error to the user;
      the UI shows a placeholder.
- [x] `GET /media/:filename` serves from disk with
      `Cache-Control: public, max-age=31536000, immutable`
- [x] Filename validated against `^[0-9a-f-]{36}\.webp$` **before any filesystem access** — never
      join user input onto a path
- [x] Re-download replaces the existing file atomically (temp file + rename), so a concurrent
      request never reads a half-written image
- [x] Images directory path comes from config, not a hardcoded string
- [x] Tests: resize-without-upscale, EXIF strip, `safeFetch` failure → `failed` status, a
      non-image response body that fools the content-type check → `failed` status (sharp itself
      rejects it), the filename validator (valid, path traversal, wrong extension, wrong length)

## Out of scope

The orphan sweep job (T034). Re-scraping/re-downloading on item edit (see above). Backfilling
images for items created before this task landed — nothing retries automatically; re-saving the
same URL through the add flow would, but there's no bulk tool here.

## Files likely touched

```
src/server/og/image.ts
src/server/og/image.test.ts
src/app/media/[filename]/route.ts
src/lib/schemas/item.ts
src/server/services/items.ts
src/server/services/items.test.ts
src/app/api/items/route.ts
src/app/w/[slug]/add-item-form.tsx
next.config.ts
package.json
```
