---
id: T058
title: generateMetadata() OG tags on the share page
epic: E6-frontend
status: done
depends_on: [T052, T057]
size: M
---

## Context

The reason this product is a Next.js app at all, per `docs/frontend/CLAUDE.md`: "a shared link has
to render as a card in WhatsApp. Breaking this breaks the core product." T057 got the link in
front of someone; this task makes opening it — or, more precisely, a crawler *fetching* it before
a human ever taps — produce a real card instead of bare text. No backend work: `getPublicWishlist`
(T052) already returns everything needed.

Target shape, from `docs/frontend/CLAUDE.md`:

```
title:       "{displayName} — {list title}"
description: "{n} items"
og:image:    a stored item image, or a generated fallback
```

## Design decisions (no prior spec existed)

**The full OG treatment only applies to the public (visitor) branch.** `{displayName}` comes from
`ownerDisplayName`, a field that only exists on `PublicVisitorWishlist` (T052) — `MyWishlist` (the
owner's own aggregate, T025) has no such field, because an owner doesn't need to be told who they
are. A logged-in owner previewing their own link never gets crawled by WhatsApp (crawlers carry no
session cookie), so the owned branch keeps its existing plain title — building out full metadata
for a code path no real sharing scenario reaches would be speculative.

**`opengraph-image.tsx` treats the public path as the only path that matters, too**, for the same
reason: WhatsApp's crawler fetches this route as a second, separate, unauthenticated request — it
never carries the cookie that would resolve an owned wishlist. Rather than pretending an
owner-only branch is meaningful here, an unknown/owned slug just renders the generic branded card.

**A stored item image wins over the generated fallback via Next's own precedence, not manual
branching.** Setting `openGraph.images` in `generateMetadata()` overrides Next's file-convention
`opengraph-image.tsx` for a route; *omitting* the key lets Next fall through to it automatically.
So `generateMetadata()` only sets `images` when a live item actually has one (`imagePath !== null`
— every item today, since T033's download pipeline doesn't exist yet) and leaves it out otherwise,
letting the convention file do the rest with zero coordination code.

**Title/description-building logic lives in a pure module** (`og-metadata.ts`), not inlined in
`generateMetadata()` — it's needed in exactly two places (`generateMetadata()` and
`opengraph-image.tsx`, which renders the same title text into the fallback card), past the
"extract on the second use" bar, and a pure `(data) => string` function is trivially unit-testable
without mocking Next's metadata machinery.

**`root layout.tsx` gains `metadataBase`.** Required for Next to resolve `opengraph-image.tsx`'s
own route into the absolute URL a crawler needs — without it, Next either warns and guesses
`localhost`, or leaves the tag broken in production.

## Acceptance criteria

- [x] The public share page's `<title>` is `"{ownerDisplayName} — {list title}"`
- [x] `og:description` (and the plain meta description) is a correctly-pluralized item count in
      Spanish ("1 artículo" / "N artículos")
- [x] `og:image` is the first live item's stored image when one exists; otherwise Next's
      `opengraph-image.tsx` convention renders a generated card with the same title
- [x] `twitter:card` is set (`summary_large_image`) so the same card works in Telegram/Discord/
      Slack previews, not just WhatsApp
- [x] The owned-wishlist branch and the not-found branch are unaffected beyond staying correct —
      no new metadata fields for paths a crawler can't reach
- [x] Tests: the pure title/description builders (pluralization, the `{name} — {title}` format);
      the image-selection helper (first item with an image, `null` when none)

## Out of scope

Actually downloading/storing item images (T033) — `og:image`'s "first stored image" branch is
correct code with no live data to exercise yet. Per-item OG tags, or any metadata beyond the one
route this task covers.

## Files likely touched

```
src/app/w/[slug]/wishlist-data.ts
src/app/w/[slug]/og-metadata.ts
src/app/w/[slug]/og-metadata.test.ts
src/app/w/[slug]/opengraph-image.tsx
src/app/w/[slug]/page.tsx
src/app/layout.tsx
src/lib/i18n/es.ts
```
