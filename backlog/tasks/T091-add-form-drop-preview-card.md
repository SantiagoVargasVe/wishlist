---
id: T091
title: "Add-item form — drop the redundant preview card to kill the vertical scroll"
epic: E11-post-deploy-ui-polish
status: done
depends_on: [T053, T086]
size: S
---

## Context

Reported from real usage: on some viewport sizes the add-item modal overflows and scrolls
vertically, which Santiago dislikes. `ItemPreviewField`
(`src/app/w/[slug]/item-preview-field.tsx`) renders, directly below the "Enlace del producto"
field, a bordered card containing the scraped thumbnail and site name, plus a pulse skeleton
while the preview is loading.

That card is now duplicate UI. [T086](T086-manual-image-fallback.md) added `ItemImagePicker`,
which already receives `scrapedUrl={preview.data?.imageUrl}` and shows the scraped image in its
drop zone (and lets the user replace it). The "is this the right product?" image confirmation
that `ItemPreviewField`'s card existed for (T053) has moved into the picker. Removing the card
reclaims roughly 64–80px plus the skeleton's height — enough to stop the overflow — and removes
the duplicated image.

## Acceptance criteria

- [ ] `ItemPreviewField` renders only the URL `Field` (label + input + validation error) — the
      bordered thumbnail-and-site-name card is gone
- [ ] The `h-16 animate-pulse` loading skeleton is removed too (it previewed the now-removed
      card; the picker has its own loading affordance)
- [ ] The scraped image is still visible before saving, via `ItemImagePicker`'s drop-zone
      preview — the only thing lost is the site-name line
- [ ] On a 768×1024 viewport the add-item modal content fits with no vertical scroll, both with
      an untouched form and with a settled preview (verify in a browser)
- [ ] `add-item-form.test.tsx` updated: drop any assertions on the removed card; keep the
      URL-field and field-gating (T082) assertions
- [ ] `preview` prop / `usePreviewQuery` import left in a clean state — if `ItemPreviewField` no
      longer needs `preview` at all, drop the prop and update the call site; if it still needs
      `preview.data` for nothing, don't leave dead wiring

## Out of scope

`edit-item-form.tsx` (it has no `ItemPreviewField`). `ItemImagePicker` itself (T086) and its
drop-zone preview. The mobile full-screen-sheet behavior of the dialog. The field-gating logic
in `useItemPreview` (T082) — `fieldsEnabled` still depends on the preview query settling, that
stays.

## Files likely touched

```
src/app/w/[slug]/item-preview-field.tsx
src/app/w/[slug]/add-item-form.tsx            (call site, if the prop shape changes)
src/app/w/[slug]/add-item-form.test.tsx
```
