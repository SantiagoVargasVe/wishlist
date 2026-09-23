---
id: T114
title: "Item image frame: one square frame for both views, packshots framed on white"
epic: E11-post-deploy-ui-polish
status: done
depends_on: [T080, T089]
size: M
---

## Context

Reported from real usage (2026-09-23), with screenshots of the same list in both views:

- **Guest view:** one tall product photo, a spray bottle, makes its card roughly three times
  taller than its neighbours. The grid stretches every card in that row to match, so the other
  three cards get a large empty area under their buttons. On a phone the bottle fills more than a
  whole screen.
- **Owner view:** the same bottle is cropped to its top third, and a wide product (a pegboard)
  loses its edges. Most other images look fine there, but only by accident (see below).

T089 already fixed one owner/guest drift, and the two cards have drifted again. Each still writes
its own image markup.

### Root causes

1. **Guest card:** `visitor-item-card.tsx`'s frame is `aspect-square` with no `overflow-hidden`.
   A box with an `aspect-ratio` that is not a scroll container gets a content-based
   `min-height: auto`. The `<img>`'s `h-full` can't resolve while the box is still being sized,
   so the image's natural height counts as the box's content, and a 0.31:1 image makes the
   "square" frame about 3.2 times as tall as it is wide.
2. **Owner card:** `item-card.tsx` uses a fixed `h-48` frame with `object-cover`. The frame's
   aspect ratio therefore depends on the column width: about 1.8:1 on a single-column phone and
   0.9:1 at four columns. No stored image shape fills it at every breakpoint without cropping.
3. **The images themselves.** This is the part neither card can fix in CSS alone.

### What the stored images actually look like

All 16 images in production, measured 2026-09-23 (aspect ratio, and the mean colour of a border
strip):

| Count | Shape | Edges | What it is |
|---|---|---|---|
| 9 | 1.91:1 (800×419) | pure white | Open Graph share canvases. The product is a roughly square blob in the middle, only about 30% of the width (e.g. 234×262 of 800×419 after trimming the white) |
| 2 | 0.31:1 (365×1173) | pure white | A tall bottle |
| 3 | 0.9–1.14:1 | pure white | Ordinary packshots |
| 2 | 0.78:1 (800×1026) | grey / brown | Full-bleed fashion photos |

**14 of 16 sit on pure white.** That decides the design:

- `object-cover` (owner today) happens to look good on the 1.91:1 canvases because cropping the
  sides removes only white padding. The same fit cuts the top and bottom off the bottle and the
  edges off a genuinely wide product.
- `object-contain` (T080's original call) never crops. But a 1.91:1 canvas contained in a square
  frame shrinks the product to about 30% of the frame. And in dark mode each white image sits
  inside dark letterbox bars, which looks like a rendering bug.
- Knowing where the product sits requires looking at its pixels, so this has to happen on the
  server when the image is stored, not in CSS.

### Options considered

| Option | Verdict |
|---|---|
| `object-cover` in a fixed frame | Crops the product whenever its shape differs from the frame (the bottle, the pegboard) |
| `object-contain` in a fixed frame | Makes the product tiny on OG canvases, and shows a dark letterbox around white images in dark mode |
| Masonry / native aspect ratio (Pinterest) | Uneven rows misalign the action buttons. T080 already rejected it |
| Contain over a blurred copy of the image | Turns white packshots muddy and the product still looks small. Built for photos, not catalog shots |
| **Frame packshots on white when storing them, then use one square cover frame** | **Chosen.** This is the Amazon / MercadoLibre catalog convention: every product on a white square with a consistent margin |

## Design

**Server side, when an image is stored** (`processImage`, used by both scraped and uploaded
images):

1. Flatten onto white. A transparent cut-out has no background of its own, and in dark mode the
   dark card would show through it.
2. **Packshot test:** if at least 90% of the image's outer border is near-white, it is a packshot
   on white.
3. A packshot is trimmed to its content, then centred on a **square white canvas with an 8%
   margin on each side**, so the product fills 84% of the tile. Every other image, typically a
   full-bleed photo, is stored exactly as before.
4. The step is idempotent: a tile that is already framed comes back unchanged, so re-running it
   never re-encodes an image a second time.

**Client side:** one shared `ItemImage` component (`src/app/w/[slug]/item-image.tsx`) is used by
both cards:

- The frame is square at every breakpoint, `relative overflow-hidden`, with the image as
  `next/image` `fill` and `object-cover`. It is never sized by its image.
- A framed packshot matches the square frame exactly, so it shows whole. A 0.78:1 photo fills
  the frame and loses about 11% from the top and bottom, which is how the guest card shows it
  today.
- The visitor card's "claimed" badge goes in as `children` (composition, per design-system.md),
  not as a prop.

**Why square rather than 4:5:** framed packshots are square. A 4:5 cover frame would crop the
sides of every packshot tile, eating the margin and then the product.

**The owner card drops T080's fixed `h-[26rem]` card and `h-48` frame.** That reverses a
task-level decision, so here is why: a fixed-height frame has no fixed aspect ratio (root cause
2). Cards in the grid still come out at equal heights. Every card in a row has the same width and
therefore the same square frame, the content below it already has a constant height (the title's
`min-h-10`, a price line that always renders, two rows of actions), and the grid stretches each
row.

### Existing images and caching

- **Backfill:** images stored before this change get framed once, at boot in production, by the
  same function. A marker file in the images directory (`.packshots-v1`, the pattern the
  orphan-image sweep already uses) makes this a one-time pass. The pass is **awaited before the
  server takes requests**, so no request can cache an old image under the new URL. It never fails
  startup: a failure on one file is logged, and that file is left as it was.
- **Cache-busting:** `/media/:filename` is served `immutable, max-age=1y` under a stable
  `{itemId}.webp` name. Rewriting files in place would be invisible to every browser, and to
  Next's image optimizer, that has already loaded them. Every `/media` URL now goes through one
  `mediaUrl()` helper that appends a version (`?v=1`). Bump the version whenever stored images
  are rewritten in place. `next.config.ts` gets `images.localPatterns` for `/media/**`, since
  local image URLs with a query string need it from Next 16 on.

## Acceptance criteria

- [x] Both cards render their image through the one `ItemImage`. The visitor "claimed" badge is
      passed as children
- [x] The frame is square at 375, 768 and 1280px in both views, and a 0.31:1 image does not
      make its card or its row taller
- [x] A packshot on white (≥ 90% near-white border) is stored as a square white tile, with the
      product centred and filling 84% of the longer side
- [x] A full-bleed photo is stored as before: resized and encoded to WebP, with no trim and no
      padding
- [x] A transparent image is flattened onto white
- [x] Framing is idempotent: an already-framed tile, including after WebP's lossy round trip, is
      not re-encoded
- [x] A product that bleeds off one edge (border < 90% white) is left alone rather than framed as
      a floating, cut-off object
- [x] Production boot frames existing packshots once (marker `.packshots-v1`) before serving.
      Photos and unreadable files are untouched. The pass never throws
- [x] Every `/media` URL (both cards, the edit form's current-image preview, `og:image`) comes
      from `mediaUrl()` and carries the version
- [x] Visitor card: the claim button stays pinned to the bottom, so buttons in a row line up
      whether a title wraps to one line or two
- [x] Tests: framing (wide canvas, tall bottle, photo untouched, transparent, idempotent,
      edge-bleed, blank), the backfill (frames packshots, skips photos, survives a corrupt file,
      writes the marker, is a no-op once marked), `ItemImage`, `mediaUrl`, `og:image` URL
- [x] Checked in a real browser with all four image shapes, in both views, light and dark

## Verification

Checked on a local **production** build (`next build` + `next start`, which runs
`instrumentation.ts`) against the dev database. The fixtures were synthetic images in each shape
from the survey (a 1.91:1 OG canvas ×2, a 0.31:1 bottle, a near-square pegboard, a 0.9:1 box, a
0.78:1 full-bleed photo ×2, a transparent cut-out, and one item with no image), stored the way the
old pipeline stored them.

- **Backfill:** the first boot logged `framed 6 stored image(s)`: every packshot, including the
  cut-out, which came out opaque. Both photos stayed byte-identical at 800×1026 and the marker was
  written. The second boot logged nothing and left every file's mtime unchanged.
- **Serving gate:** Next's `handleRequest` awaits `prepare()`, which runs the instrumentation hook,
  so no request is served before the backfill finishes.
- **Guest view,** measured in the browser. At 1280px every frame was 170×170, every card in a full
  row was 332px, and every button sat 13px from its card's bottom. At 768px, 351×351 frames, with
  a one-line and a two-line title side by side and their buttons still level. At 375px, a 341×341
  frame with the whole bottle on screen, and no horizontal scroll. Checked in light and dark.
- **Owner view:** checked without signing in. The real `ItemGrid` was server-rendered with the
  fixtures (a throwaway harness, since deleted) and loaded against the build's CSS and image
  optimizer. At 1280px, 170×170 frames and every card 352px, whether it had two actions or three.
  At 375px, a 341×341 frame, where the old `h-48` frame was 1.8:1.
- **Cache-busting:** optimizer requests carry `url=/media/<id>.webp?v=1` and return 200.

## Out of scope

- **Cache-busting when a user replaces one item's image** from the edit form. That is the same
  stable-filename + `immutable` mechanism, but per item, and it existed before this task.
  `mediaUrl()` is the seam where a per-item version would go. Separate task.
- A two-column grid on phones, a lightbox or zoom, or changing `IMAGE_MAX_WIDTH`.
- The add/edit form's drop-zone preview styling (T086). Only its URL goes through `mediaUrl()`.
- Re-downloading originals from `source_image_url`. The backfill works from the stored files.

## Files likely touched

```
src/server/og/packshot.ts                 (new) framing
src/server/og/packshot.test.ts            (new)
src/server/og/packshot-backfill.ts        (new) one-time boot pass
src/server/og/packshot-backfill.test.ts   (new)
src/server/og/image.ts                    processImage uses framing
src/instrumentation.ts                    await the backfill in production
next.config.ts                            images.localPatterns, webpack stub for the backfill
src/lib/media.ts                          (new) mediaUrl()
src/lib/media.test.ts                     (new)
src/app/w/[slug]/item-image.tsx           (new) shared frame
src/app/w/[slug]/item-image.test.tsx      (new)
src/app/w/[slug]/item-card.tsx
src/app/w/[slug]/item-card.test.tsx
src/app/w/[slug]/visitor-item-card.tsx
src/app/w/[slug]/edit-item-form.tsx
src/app/w/[slug]/og-metadata.ts
src/app/w/[slug]/og-metadata.test.ts
```
