---
id: T051
title: /w/[slug] owner view
epic: E6-frontend
status: done
depends_on: [T025, T050]
size: M
---

## Context

The first real data page. `/w/[slug]` is the single shared route for both the owner and visitor
experience — see [frontend/CLAUDE.md](../../docs/frontend/CLAUDE.md) § *Only two pages exist*.
This task builds **only the owner branch**; the visitor branch is T052 and doesn't exist yet, so
the non-owner path renders a small, honestly-temporary placeholder rather than a fake visitor view
or a `notFound()` — a real visitor link must keep working once T052 replaces that branch.

The owner view renders from **`GET /api/me`'s data shape**, not `GET /api/w/:slug` (that endpoint
is visitor-only and doesn't exist yet either). Per architectural discussion: the page is a Server
Component and calls `getMyWishlists` from `src/server/services/me.ts` directly rather than
fetching its own Route Handler over HTTP — no cookie-forwarding dance, no extra network hop,
matching root [CLAUDE.md](../../CLAUDE.md)'s "`src/app/` calls into `src/server/` services."
Client-side mutations in later tasks (T053+) still go through `apiFetch` → the Route Handler, same
as the two auth forms already do.

This also closes the loop T014 explicitly left open: `/` now has a real destination to redirect
to, so its placeholder demo content is replaced with the redirect logic
[frontend/CLAUDE.md](../../docs/frontend/CLAUDE.md) already specifies ("`/` redirects: logged in →
your default list, otherwise → `/login`").

Read [design-system.md](../../docs/frontend/design-system.md) (component rules, responsive rules)
and [data-model.md](../../docs/context/data-model.md) (deletion/soft-delete semantics — nothing
here mutates yet, but the item shape reflects them).

## Acceptance criteria

- [ ] `src/app/w/[slug]/page.tsx` — Server Component. Resolves the current session
      (`currentUserId`), calls `getMyWishlists`, and finds the wishlist matching `params.slug`
      among the session user's **own** wishlists
- [ ] `getMyWishlists` is called **once per request**, shared between `generateMetadata` and the
      page body via React's `cache()` — not once each
- [ ] Owner match found: renders the wishlist's title and its items in a responsive grid (1 / 2 /
      3–4 columns per the mobile-first rule), each item showing image-or-placeholder, title, and
      price (when both `priceAmount` and `priceCurrency` are set)
- [ ] No owner match (not logged in, logged in as someone else, or an invalid slug): renders a
      small placeholder, clearly temporary, in place of the real visitor view — T052 replaces this
      branch outright, so it isn't worth building a convincing fake
- [ ] `generateMetadata()` sets at least `title` to the wishlist's title when found. Full OG
      image/description enrichment for the shared-link card is T058, not this task
- [ ] `src/lib/money.ts` — `formatMoney(amount, currency)` using `Intl.NumberFormat`, `es-CO` for
      `COP` and `en-US` for `USD`, formatting the amount exactly as stored (no conversion, no
      rounding beyond what `Intl` does by default)
- [ ] Every item card is a link to `item.url` (`target="_blank" rel="noopener noreferrer"`) — the
      only owner interaction this task builds; edit/delete is T054
- [ ] An item with no `imagePath` renders a placeholder that reads as intentional, not broken —
      true for every item today, since the image pipeline (T033) isn't wired up to anything yet
- [ ] Empty wishlist (a fresh default list) renders a clear "no items yet" state, not a blank page
- [ ] `src/app/page.tsx` (`/`) becomes the real redirect: logged in → the caller's default
      wishlist (`getMyWishlists(...)[0]`, already sorted default-first) → `/w/{slug}`; anonymous →
      `/login`. Replaces the placeholder demo content entirely — its own header comment predicted
      exactly this
- [ ] Every string routes through `t()`; every primitive/token comes from the existing design
      system
- [ ] Tests: `formatMoney` for COP and USD, including a value with cents; item card renders a
      price only when both amount and currency are present; item card falls back to the
      placeholder when there's no image

## Out of scope

The visitor branch (T052) — including any real distinction between "invalid slug" and "someone
else's real list," which needs `GET /api/w/:slug` to check. Full OG metadata (T058). Add/edit/
delete item (T053/T054), create/rename/delete wishlist (T055), the list filter (T056), share CTA
(T057). Any claim data or UI — items never show claim state to the owner regardless
(`hide_claims_from_owner`), and `item_claims` doesn't exist yet (T040 is written, not built).

## Files likely touched

```
src/app/w/[slug]/page.tsx
src/app/w/[slug]/item-grid.tsx
src/app/w/[slug]/item-card.tsx
src/app/w/[slug]/item-card.test.tsx
src/app/page.tsx
src/lib/money.ts
src/lib/money.test.ts
src/lib/i18n/es.ts
```
