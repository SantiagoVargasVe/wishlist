---
id: T035
title: Vendor-specific image extraction (Amazon)
epic: E4-og
status: done
depends_on: [T031]
size: S
---

## Context

[T030's own task file](T030-safe-fetch-ssrf-guard.md) documents a live finding: after fixing the
transport-level bugs (gzip decompression, missing Content-Type), a pasted Amazon product link
still resolves `imageUrl: null`. That's not a bug in `safeFetch` or the OG parser — Amazon's page
genuinely has no `og:image`, `twitter:image`, or JSON-LD `Product.image` for a generically
identified client. The image lives only in `data-a-dynamic-image`, a proprietary JSON attribute
on the product `<img>` tag (`{"https://...jpg": [width, height], ...}`), which no standards-based
parser recognizes.

Confirmed live before writing this task: MercadoLibre has a *different* problem — any non-browser
client (curl with a real Chrome UA, no cookies, our bot UA) gets `302`'d to an
`/gz/account-verification` bot-check wall, and their public item API now returns
`403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES`. There's no HTML served to extract anything from, so
it's explicitly **out of scope** here — see below.

## Design decisions

**Lives inside `parseProductMetadata`, as the lowest-precedence source for `imageUrl` only.**
`extractImageUrl` already tries `og:image:secure_url` → `og:image` → `twitter:image` →
`twitter:image:src` → JSON-LD `image`, in that precedence order, before normalizing whatever wins
against `pageUrl`. A vendor extractor slots in as one more `??` fallback at the end of that same
chain — any standard tag a site does provide still wins outright, and the URL-normalization step
(`new URL(raw, pageUrl)`) stays a single codepath instead of a second one just for vendor results.
Title/description/price are untouched — Amazon's page already resolves those correctly after the
T030 fix (via `<title>` and other standard fallbacks); only `imageUrl` needed a vendor-specific
source.

**A small hostname-keyed registry, not a generic plugin system.** `src/server/og/vendors/index.ts`
exports `resolveVendorImage($, pageUrl)`, matching `pageUrl`'s hostname against a short array of
`{ hostnamePattern, extract }` entries and delegating to the matched vendor's own file
(`vendors/amazon.ts`). One vendor today. Deliberately not building a discovery mechanism, a config
file, or an abstract base class for vendors that don't exist yet — a second real vendor extends
the array by one line; a third might justify more structure, but that's a decision for when it's
real, not now.

**Scoped to `amazon.*` hostnames, not "any page with this attribute."** `data-a-dynamic-image` is
Amazon's own convention; matching on hostname first (rather than sniffing the attribute on any
domain) keeps a coincidentally-named attribute on an unrelated site from being misread as a
product image.

## Acceptance criteria

- [x] `extractAmazonImage($)` in `src/server/og/vendors/amazon.ts`: reads `data-a-dynamic-image`
      off the product image element, parses the `{url: [width, height]}` JSON map, returns the
      URL with the largest `width * height`; returns `null` on a missing attribute, malformed
      JSON, or a shape that doesn't match (never throws — same contract as the rest of the parser)
- [x] `resolveVendorImage($, pageUrl)` in `src/server/og/vendors/index.ts`: matches `pageUrl`'s
      hostname against `amazon.<tld>` (and `www.`/regional subdomains), delegates to
      `extractAmazonImage`; any other hostname resolves to `null` without inspecting the page
- [x] `parser.ts`'s `extractImageUrl` tries the vendor fallback last, only when every standard
      source (`og:image*`, `twitter:image*`, JSON-LD) is absent
- [x] Tests: largest-of-several-sizes selection, missing attribute, malformed JSON, non-array/
      non-numeric dimension shapes, standard `og:image` taking precedence over the vendor result
      when both are present, an Amazon-hosted page with no vendor attribute at all still resolving
      to `null` (not throwing), and the same `data-a-dynamic-image` attribute on a **non**-Amazon
      hostname being ignored

## Live verification

Unit tests exercise `extractAmazonImage` against fixtures matching Amazon's real
`data-a-dynamic-image` shape directly, and `parser.test.ts` confirms the fallback wiring. A live
end-to-end fetch of the original reported URL was also attempted, but consistently landed on
`/clp/B0FK39FXJH` — [T030's task file](T030-safe-fetch-ssrf-guard.md) already documents this as a
separate, pre-existing Amazon behavior ("User-Agent-based 301 redirects to a stripped `/clp/`
landing page for non-browser UAs (sometimes)"), not something this task's fallback can or should
work around — it's Amazon actively declining to serve the product page at all, not a markup gap.
When Amazon does serve the real page (as it did during T030's own investigation), the fallback
implemented here is what picks up its image; when it serves `/clp/` instead, no client-side markup
strategy fixes that.

## Out of scope

**MercadoLibre.** Investigated live (see Context) — it 302-redirects any non-browser client to a
bot-check wall before any product HTML is ever served, and its public item API now requires
policy-gated auth. There's no markup this task's approach could extract from; fixing this would
mean either an official MercadoLibre developer-app integration (a different shape of work,
needs credentials registered on their platform) or scraping-evasion techniques this app has no
interest in maintaining. Left undone on purpose, not forgotten.

Title/description/price vendor overrides — Amazon's page already resolves those through existing
standard fallbacks; nothing here needed a vendor-specific source for them.

A general vendor-plugin framework beyond the one-array registry described above.

## Files likely touched

```
src/server/og/vendors/amazon.ts
src/server/og/vendors/amazon.test.ts
src/server/og/vendors/index.ts
src/server/og/vendors/index.test.ts
src/server/og/parser.ts
src/server/og/parser.test.ts
```
