---
id: T080
title: Item card — fixed height, contained images, visible currency
epic: E9-post-mvp-ui
status: done
depends_on: [T051]
size: S
---

## Context

Reported from real usage of the deployed app: item cards in the grid (`item-grid.tsx` →
`item-card.tsx`) render at inconsistent heights and look "awful" once a list has a mix of
items — long vs. short titles, with vs. without a price line, and images of different aspect
ratios all push each card's content section to a different height. The grid
(`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`, default
`align-items: stretch`) then stretches every card in a row to match the tallest one, so one
long-titled item makes its whole row look uneven.

Separately: `item-card.tsx`'s image box is `aspect-square` with `object-cover`, which crops any
image that isn't already roughly square — fine for most product photos, ugly for a tall or wide
one.

Also reported: two items in the same list, one priced in COP and one in USD, are visually
indistinguishable — `formatMoney()` (`src/lib/money.ts`) uses `Intl.NumberFormat` with
`style: "currency"`, and **both `es-CO` (COP) and `en-US` (USD) render the `$` glyph** — the only
difference is thousands/decimal punctuation (`$135.000,00` vs `$135,000.00`), which isn't a
reliable enough visual cue for a user scanning a grid.

## Design decisions (none prior — first pass at card layout)

**Fix the height at the card level, not just the image.** A fixed `aspect-square` image already
solves the image's own height; the real inconsistency is the content section below it (title +
price + actions). Give the card itself a fixed or min-height and let overflowing content (a long
title) truncate — `line-clamp-2` is already used for the title, so this is mostly about giving the
whole card a consistent height budget rather than letting `flex-1` content grow freely.

**`object-contain`, not `object-cover`, with a filled background.** Cropping a non-square product
photo loses information a visitor might actually want (the whole product). Switching to
`object-contain` requires a background color on the image box (already `bg-muted`) so a
non-square image doesn't leave visually broken-looking empty corners — letterboxing against a
neutral background reads as intentional, cropping half a product photo doesn't.

**Currency code appended explicitly, not relying on the symbol.** `formatMoney()`'s `$135.000,00`
vs `$135,000.00` output is correct and shouldn't change (it's exactly what's stored, per
ADR-0009) — the fix belongs in the card, appending the ISO code MercadoLibre/Amazon-style
(`$135.000,00 COP`), not in `formatMoney()` itself, since other callers of `formatMoney()` may
already pair it with their own currency label.

## Acceptance criteria

- [x] Every card in the grid renders at the same height regardless of title length or whether a
      price is present
- [x] A non-square image is fully visible (`object-contain`), not cropped
- [x] The price line shows the ISO currency code alongside the amount (e.g. `$135.000,00 COP`)
- [x] A very long title still truncates sensibly (`line-clamp-2` or equivalent) rather than
      breaking the fixed height
- [x] No visual regression for the "no image" placeholder state

## Verification

Live-verified in a browser against a real dev server + seeded data: three items (a long two-line
title with a COP price, a short title with a USD price, and a title with neither price nor image)
all render at the identical card height, with `$1.300.000,00 COP` and `$49.99 USD` clearly
distinguishable side by side.

## Out of scope

Changing `formatMoney()`'s actual number formatting — this task only adds the currency code next
to its existing output. A masonry/variable-height grid layout as an alternative to fixed-height
cards — fixed height was the explicit ask.

## Files likely touched

```
src/app/w/[slug]/item-card.tsx
src/app/w/[slug]/item-card.test.tsx
```
