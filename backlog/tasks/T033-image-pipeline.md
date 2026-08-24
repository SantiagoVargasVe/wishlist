---
id: T033
title: Image download pipeline and /media serving
epic: E4-og
status: todo
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

## Acceptance criteria

- [ ] `downloadItemImage(itemId, sourceUrl)` in `src/server/og/image.ts`
- [ ] Fetches **through `safeFetch`** with `image/*` content-type and a 10MB cap — the image URL
      comes from scraped HTML and is exactly as untrusted as the page URL
- [ ] `sharp`: resize to max 800px wide (no upscaling), convert to webp q80, strip EXIF
- [ ] Writes `data/images/{item_id}.webp`; sets `image_path` and preserves `source_image_url`
- [ ] Runs **async after the item row is created** — a slow retailer CDN must never delay the save
- [ ] Failure sets `og_status` appropriately and leaves `image_path` null. Not an error to the
      user; the UI shows a placeholder.
- [ ] `GET /media/:filename` serves from disk with
      `Cache-Control: public, max-age=31536000, immutable`
- [ ] Filename validated against `^[0-9a-f-]{36}\.webp$` **before any filesystem access** — never
      join user input onto a path
- [ ] Re-download replaces the existing file atomically (temp file + rename), so a concurrent
      request never reads a half-written image
- [ ] Images directory path comes from config, not a hardcoded string

## Out of scope

The orphan sweep job (T034) and the OG parser that supplies `sourceUrl` (T031).

## Files likely touched

```
src/server/og/image.ts
src/server/config.ts
src/app/media/[filename]/route.ts
src/server/og/__tests__/image.test.ts
```
