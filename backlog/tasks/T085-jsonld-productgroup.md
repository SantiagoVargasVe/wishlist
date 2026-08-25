---
id: T085
title: Parse schema.org ProductGroup, not just Product
epic: E10-preview-reliability
status: todo
depends_on: [T031]
size: S
---

## Context

`findProductNode()` in [parser.ts](../../src/server/og/parser.ts) only matches
`@type: "Product"`. Real retailers routinely publish a **`ProductGroup`** instead — one node for
the garment, with a `hasVariant[]` array holding a `Product` per size/colour, and the price on
each variant's `offers`.

When that happens we silently lose the price even though it is sitting in the HTML. Verified
against a real Zara product page (`high-waisted-trf-mom-fit-jeans-p02569047`), fetched live and
run through our own parser:

```
title:       "HIGH-WAISTED TRF MOM FIT JEANS"   ok — from og:title
description: "HIGH WAIST - REGULAR LENGTH…"     ok — from meta[name=description]
imageUrl:    "https://static.zara.net/…-p.jpg"  ok — from og:image
priceAmount: null                               LOST
priceCurrency: null                             LOST
```

The page's JSON-LD is:

```json
{ "@type": "ProductGroup",
  "name": "HIGH-WAISTED TRF MOM FIT JEANS",
  "hasVariant": [
    { "@type": "Product", "name": "… - White - 25 (US 0)",
      "offers": { "@type": "Offer", "priceCurrency": "USD", "price": "9.98",
                  "availability": "https://schema.org/OutOfStock" } }
  ] }
```

Note the first variant is `OutOfStock` and priced 9.98 — variants differ in both price and
availability, so "just take `hasVariant[0]`" picks an arbitrary, possibly clearance or
sold-out, price. That choice is the substance of this task, not an afterthought.

Read [T031's task file](T031-og-parser.md) for the precedence rules this must not disturb, and
[api-contract.md](../../docs/context/api-contract.md) § *Preview* for the "prefill suggestion,
never a gate" contract.

## Acceptance criteria

- [ ] `findProductNode()` also matches `@type: "ProductGroup"`, including the array form
      (`["ProductGroup", …]`) and inside `@graph`, exactly as it already does for `Product`
- [ ] When the matched node is a `ProductGroup` with no usable `offers` of its own, price
      resolution descends into `hasVariant[]`
- [ ] **Variant selection is deliberate and documented**: prefer the lowest price among variants
      whose `availability` is `InStock`; fall back to the lowest price across all variants when
      none are in stock. Whatever rule is chosen, a comment states *why* — an arbitrary
      `hasVariant[0]` is not acceptable
- [ ] `name` / `description` / `image` fall back to the `ProductGroup`'s own fields when the
      group has them, so a group without variants still yields title and image
- [ ] Existing `Product` pages are completely unaffected — the current precedence order
      (og → twitter → JSON-LD → vendor) does not change, and JSON-LD stays below the og tags
- [ ] A malformed or partial `hasVariant` (not an array, empty, variants with no `offers`,
      `offers` with no `price`) resolves to `null` rather than throwing — same contract as today
- [ ] Unit tests cover: ProductGroup with in-stock and out-of-stock variants at different
      prices, ProductGroup with no variants, ProductGroup nested in `@graph`, and a plain
      `Product` (regression). Tests are pure HTML-in/object-out — **no network**
- [ ] A saved fixture of the real Zara page (trimmed to the `<head>` + the ld+json block) lives
      in the test file or a fixture file, and asserts `priceAmount: "9.98"`-style extraction

## Out of scope

- Anything about **fetching** — this task assumes the HTML is already in hand. Zara is currently
  unreachable server-side for an unrelated reason (bot wall on User-Agent); that is a separate,
  undecided problem and must not be touched here.
- Currency filtering. `scrape()` in [preview.ts](../../src/server/og/preview.ts) already drops
  unsupported currencies; the parser keeps returning best-effort ISO codes.
- `AggregateOffer` / `priceSpecification` shapes. Add them only if a real page is found that
  needs one — do not build speculatively.
- Vendor-specific extractors (`src/server/og/vendors/`). This is a generic schema.org fix and
  must stay generic.

## Files likely touched

```
src/server/og/parser.ts
src/server/og/parser.test.ts
```
