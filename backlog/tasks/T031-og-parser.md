---
id: T031
title: OG / Twitter / JSON-LD parser with precedence + sanitization
epic: E4-og
status: done
depends_on: [T030]
size: M
---

## Context

Step 3 of the pipeline in [architecture.md](../../docs/context/architecture.md) § *Data flow:
adding an item*: given HTML already fetched through `safeFetch` (T030), extract a title,
description, image URL, site name, and price. **Pure parsing only** — no fetching (T030 did
that), no caching (`og_cache` is T032's), no endpoint (T032). A `cheerio.load(html)` in, a plain
object out.

Read [security.md](../../docs/context/security.md) § *Input handling* — "OG metadata is untrusted
scraped content... truncate, strip, treat exactly like user input" — and root
[CLAUDE.md](../../CLAUDE.md)'s non-negotiable #2: the scrape is a prefill suggestion, never a
gate. A page with no metadata at all, or metadata this parser can't confidently interpret, must
resolve to `null` fields, not an error.

## Design decisions (this task had no prior spec — worth stating explicitly)

**Precedence is per-field, not one global "OG beats Twitter beats JSON-LD" order.** JSON-LD's
`Product.offers` is the most structured, most reliable source for *price* specifically — it
carries amount and currency as separate, spec-typed fields — so it's tried first for price even
though OG wins for title/image (curated for how a page wants to look when shared, and far more
consistently populated across retailers than JSON-LD).

- **title:** `og:title` → `twitter:title` → JSON-LD `name` → `<title>`
- **description:** `og:description` → `twitter:description` → JSON-LD `description` →
  `<meta name="description">`
- **image:** `og:image:secure_url` → `og:image` → `twitter:image` (or `twitter:image:src`) →
  JSON-LD `image` (string, array, or `ImageObject.url`) — resolved against the page's own URL if
  relative, since not every site emits an absolute one despite the spec asking for it
- **site name:** `og:site_name` → the request URL's hostname
- **price:** JSON-LD `offers.price`/`offers.priceCurrency` (or `offers[0]` if an array, or
  `lowPrice` for an `AggregateOffer`) → OG `product:price:amount`/`product:price:currency` → a
  Twitter `twitter:label*` meta matching `/price/i` paired with its `twitter:data*` value

**Price parsing is deliberately conservative.** JSON-LD and OG price fields are separate
amount+currency pairs — no ambiguity. The Twitter fallback is a single free-form string
(`"$49.99"`, `"1.300.000 COP"`...), and `$` alone is genuinely ambiguous between USD and COP —
guessing wrong is a real correctness bug (a mistagged $1,300,000 COP item is nothing like $1.3M
USD). That fallback only resolves a price when an explicit 3-letter currency code is present in
the string; otherwise it returns `null` rather than guess. This parser also does **not** filter
to the app's two supported currencies (`COP`/`USD`) — that's a caller decision (T032), not a
parsing concern; a EUR price is real data even if this app can't use it yet.

## Acceptance criteria

- [ ] `parseProductMetadata(html: string, pageUrl: string): ParsedProduct` in
      `src/server/og/parser.ts`, returning
      `{ title, description, imageUrl, siteName, priceAmount, priceCurrency }`, every field
      `string | null`
- [ ] Each field follows the precedence chain above; a page with none of a field's sources
      present resolves that field to `null`, never throws
- [ ] Malformed JSON-LD (invalid JSON, or valid JSON with no `Product` block) is skipped, not
      fatal — the rest of the page still parses
- [ ] A relative `image` URL resolves against `pageUrl`
- [ ] Sanitization: title/description/siteName are trimmed, internal whitespace collapsed,
      control characters stripped, and truncated (title 300 chars, description 2000 — matching
      `createItemSchema`'s own limits so a full-length scrape never gets double-truncated
      downstream; siteName 100)
- [ ] `priceAmount` is a plain decimal string (`"49.99"`), comma-thousands and
      period-thousands/comma-decimal formats both normalized; anything that doesn't confidently
      reduce to a valid `numeric(14,2)`-shaped value (≤12 integer digits, ≤2 decimals, > 0)
      resolves to `null` for both `priceAmount` and `priceCurrency` — they're a pair
- [ ] Tests: fixture HTML per precedence path per field (OG-only, Twitter-only, JSON-LD-only, all
      three present so precedence is actually exercised), a page with no metadata at all, malformed
      JSON-LD, a relative image URL, each price format (JSON-LD object/array/AggregateOffer, OG,
      Twitter with an explicit currency code, Twitter with only `$` resolving to `null`), and the
      truncation/control-character stripping paths

## Out of scope

Fetching (T030, already done). `POST /api/preview` and `og_cache` (T032). Downloading the image
(T033). Filtering price to the app's supported currencies — a caller concern, not this parser's.

## Files likely touched

```
src/server/og/parser.ts
src/server/og/parser.test.ts
package.json          # adds cheerio — already in architecture.md's intended dependency set
```
