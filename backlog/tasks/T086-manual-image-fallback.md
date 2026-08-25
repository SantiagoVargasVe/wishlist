---
id: T086
title: Let the user supply an item image URL when the scrape finds none
epic: E10-preview-reliability
status: todo
depends_on: [T033, T053, T054]
size: M
---

## Context

Real usage (2026-08-25): for a large share of pasted links the preview comes back with **no
image**, which is the single field that matters most on a card. Title and price can be typed;
an image cannot. Today there is no way to supply one — if the scrape misses, the card shows the
"no image" placeholder forever, with no recourse anywhere in the UI.

Causes vary and most are not fixable by better parsing: some sites serve a bot wall to any
server-side fetch (Adidas, H&M — blocked regardless of User-Agent), some publish no `og:image`
at all, and some lazy-load every `<img>` behind a placeholder so there is nothing to harvest.
This task stops trying to win that fight and gives the user an escape hatch that works
**everywhere**, independent of any scraping improvement.

Two facts make this much cheaper than it looks, both verified rather than assumed:

1. **`createItemSchema.imageUrl` already exists** ([item.ts](../../src/lib/schemas/item.ts)) and
   `POST /api/items` already stores it as `source_image_url` and hands it to
   `downloadItemImage()`. The create path is a **UI-only** change — the API accepts a manual
   image URL today.
2. **`updateItemSchema` has no `imageUrl`.** Editing an item to add or replace an image is
   genuinely unsupported and needs schema + service + route work. This is the larger half.

Also verified: retailer *image CDNs* generally do **not** block us even when their HTML does —
`static.zara.net` serves `WishlistBot/1.0` a `200 image/jpeg`. So "right-click → copy image
address → paste" fully unblocks Zara/Bershka-class sites through the existing
[image.ts](../../src/server/og/image.ts) pipeline, with no change to how we fetch HTML.

Read [design-system.md](../../docs/frontend/design-system.md) (mandatory before any component),
[T033's task file](T033-image-pipeline.md) for the download contract, and
[security.md](../../docs/context/security.md) § *SSRF* — a user-supplied image URL is a
user-supplied URL and gets no exemption.

## Acceptance criteria

**Add-item form**

- [ ] When a preview settles with no `imageUrl` (including `ogStatus: "failed"`), the form
      offers an optional "image URL" input rather than showing nothing
- [ ] A manually entered image URL is previewed inline, the same reassurance the scraped image
      already provides in `src/app/w/[slug]/item-preview-field.tsx`
- [ ] The user can also **override** a scraped image that is wrong, not only fill a missing one
- [ ] The manual value is what gets submitted as `imageUrl`. Note the current wiring:
      `ItemPreviewField` displays from `preview.data` while form state carries `imageUrl` for
      submit — after this task the displayed image and the submitted one must not be able to
      disagree
- [ ] Pasting a new product URL re-runs the scrape and does not silently keep a stale manual
      image from the previous URL
- [ ] An invalid image URL is a field-level validation error, not a failed save

**Edit-item form**

- [ ] `updateItemSchema` accepts `imageUrl`, and `PATCH /api/items/:id` re-runs
      `downloadItemImage()` when it changes
- [ ] The existing stored image can be replaced, and the item's `image_path` /
      `source_image_url` / `ogStatus` end up consistent with the new download's outcome
- [ ] Follows the same unawaited-download rule as create (root CLAUDE.md non-negotiable #2 —
      **a slow retailer CDN must never delay the save**). T081's delayed `router.refresh()`
      catch-up is the established pattern for making the new image appear; reuse it rather than
      awaiting the download

**Both**

- [ ] The image URL is fetched through `safeFetch` exactly as a scraped one is — no new fetch
      path, no bypass. This is a **new user-supplied-URL surface** and the SSRF guard is what
      makes it safe
- [ ] A manual URL that turns out not to be an image, or fails to download, degrades to the
      existing placeholder and never blocks or fails the save
- [ ] i18n keys for every new string, Spanish-first — no hardcoded copy
- [ ] Components stay ≤ 100 lines (ESLint `max-lines`); extract rather than grow
      `add-item-form.tsx`, which three tasks have already touched
- [ ] Tests: manual URL submitted on create, manual URL replacing an image on edit, invalid URL
      rejected at the field, stale-manual-image-cleared-on-URL-change, and a failed download
      leaving the item saved with no image

## Out of scope

- **File upload / drag-and-drop.** Deliberately excluded: it needs multipart handling, size and
  content-type sniffing, and a new write surface, none of which the paste-a-URL path requires —
  and it would not have shipped in the same review. Worth a follow-up task if pasting a URL
  proves too fiddly in practice.
- Changing how HTML is fetched (User-Agent, bot walls, headless rendering). Undecided and
  tracked separately; this task is deliberately independent of it.
- Parser changes — see [T085](T085-jsonld-productgroup.md).
- Cropping, rotating, or any image editing. `sharp` already resizes and re-encodes; that is all
  the processing this app does.
- Harvesting candidate images off the page for the user to pick from. A reasonable future
  feature, but it depends on having the HTML — which is exactly what fails for the sites that
  motivated this task.

## Files likely touched

```
src/lib/schemas/item.ts
src/app/w/[slug]/item-preview-field.tsx
src/app/w/[slug]/add-item-form.tsx
src/app/w/[slug]/edit-item-form.tsx
src/app/w/[slug]/hooks/use-item-preview.ts
src/app/api/items/[id]/route.ts
src/server/services/items.ts
src/lib/i18n/es.ts
```
