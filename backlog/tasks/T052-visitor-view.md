---
id: T052
title: /w/[slug] visitor view
epic: E6-frontend
status: done
depends_on: [T040, T050, T051]
size: M
---

## Context

Completes the `/w/[slug]` route T051 started: the branch that currently renders a temporary
placeholder for anyone who isn't the list's owner becomes the real visitor experience — read-only,
same as T051's owner view was. The interactive claim/unclaim button, optimistic toggle, and
localStorage undo token are **T041**, not this task — mirrors the split already established on the
owner side (T051 renders, T053/T054 mutate).

**This task also builds `GET /api/w/:slug`.** No existing task owns it: T040 (claims) explicitly
scoped itself to the claim/unclaim *mutations* only, and this endpoint doesn't appear in any other
task's file. It's the same relationship T025 had to T051 — the read endpoint before the page that
renders it — just built in the same PR instead of a prior one, since nothing else needed it first.

Read [api-contract.md](../../docs/context/api-contract.md) § *Public list view* — this endpoint
**cannot share a handler or a service function with `GET /api/me`**: the public view exposes claim
state and hides owner identity beyond `displayName`; the owner view does the reverse. Merging them
is exactly how claim data would leak to the owner. Also read
[security.md](../../docs/context/security.md) § *Privacy* (don't reveal who claimed something) and
[frontend/CLAUDE.md](../../docs/frontend/CLAUDE.md) (accessibility: claimed state must never be
signalled by color alone).

## Acceptance criteria

- [ ] `src/server/services/public-wishlist.ts` — `getPublicWishlist(slug)`: wishlist `title`,
      owner's `displayName` only (no id, no email), and live items each with a `claimed: boolean`
      — never `claimedByUserId` or the claim token. Throws `WishlistErrors.notFound()` for an
      unknown slug
- [ ] `GET /api/w/:slug` route wrapping it, `404` when the slug doesn't exist
- [ ] `src/app/w/[slug]/page.tsx`'s non-owner branch: looks up the public wishlist (via the
      service directly, same SSR pattern T051 established — not a self-fetch) and renders the
      visitor view, or Next's real `notFound()` when no wishlist exists at all for that slug
      (replacing T051's placeholder, which could not tell those two cases apart)
- [ ] Visitor item card shows the image-or-placeholder, title (linking to `item.url`), price when
      present, and — when claimed — a visible **and** textual badge (never color alone)
- [ ] Empty wishlist renders the same "no items yet" state as the owner view
- [ ] Every string through `t()`; responsive per the existing grid rules
- [ ] Tests: `getPublicWishlist` — unknown slug throws `WISHLIST_NOT_FOUND`; an unclaimed item
      reports `claimed: false`; a claimed item reports `claimed: true` with no claimer identity
      anywhere in the result; a soft-deleted item never appears; a wishlist with zero items still
      resolves (not a 404) with `items: []`

## Out of scope

The claim/unclaim button itself — optimistic toggle, `claimToken` in localStorage, undo — is
**T041**. Full OG metadata for the shared-link card (T058); this task's `generateMetadata()` only
sets `title`, same bar T051 held itself to. `hide_claims_from_owner` (T043) doesn't apply here —
per data-model.md it governs a future *owner*-side read, not this endpoint, which always includes
claim state regardless of that flag.

## Files likely touched

```
src/server/services/public-wishlist.ts
src/server/services/public-wishlist.test.ts
src/app/api/w/[slug]/route.ts
src/app/w/[slug]/page.tsx
src/app/w/[slug]/owner-view.tsx
src/app/w/[slug]/visitor-view.tsx
src/app/w/[slug]/visitor-item-grid.tsx
src/app/w/[slug]/visitor-item-card.tsx
src/lib/i18n/es.ts
```
