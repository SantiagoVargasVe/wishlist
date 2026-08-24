# Frontend Context

Scope: `src/app/` (routes, components, client state) and `src/lib/` (shared utils, i18n).

You probably don't need `docs/backend/`. If you're changing an endpoint's shape, read
[api-contract.md](../context/api-contract.md) instead of the backend conventions.

## The hard rule

**Never import Drizzle, the DB client, or anything under `src/server/db/`.** Route Handlers call
services; components call Route Handlers. Reaching past that boundary is what makes FE and BE
context inseparable, which defeats the point of this setup.

## Only two pages exist

| Route | What it is |
|---|---|
| `/login`, `/register` | Auth. Register requires an invite code. |
| `/w/[slug]` | The entire app. |

`/` redirects: logged in → your default list, otherwise → `/login`.

`/w/[slug]` renders one of two ways from the same route:

- **Owner view** — you own this list. Add/edit/delete items, manage lists, filters, share CTA.
- **Visitor view** — anyone else, logged in or not. Read-only plus mark/unmark bought.

A logged-in user viewing someone else's list gets the visitor view. There is no third mode.
Decide from the server session vs. the list's owner, never from a client flag.

## Server vs client components

Default to **Server Components**. Reach for `"use client"` only for actual interactivity —
modals, filters, optimistic claim toggles.

`/w/[slug]` **must** be server-rendered with `generateMetadata()` emitting OG tags. This is why
the stack is Next.js at all — a shared link has to render as a card in WhatsApp. Breaking this
breaks the core product.

```
title:       "{displayName} — {list title}"
description: "{n} items"
og:image:    a stored item image, or a generated fallback
```

## Data loading

The owner view renders from a single `GET /api/me`. Visitor view uses `GET /api/w/:slug`.
Don't fan out into per-item requests.

Claim toggles are **optimistic** — flip immediately, reconcile on response, roll back and toast
on failure. A visitor tapping "bought" on a phone shouldn't wait on a round trip.

## Claim tokens

When a visitor claims an item, the response carries a `claimToken`. Persist it:

```
localStorage["wishlist:claims"] = { [itemId]: claimToken }
```

That's what lets an anonymous visitor undo their own claim. On load, read it to decide whether
an item shows "reserved by someone" or "you reserved this — undo". **Never put a claim token in
a URL** — it leaks via logs and `Referer`.

## Adding an item

1. Modal opens, user pastes a URL
2. Fire `POST /api/preview` on paste (debounced), show a skeleton
3. Prefill title, image, price, currency when they come back
4. **All fields stay editable, and the save button is never disabled by a failed scrape.**
   Roughly half of retailers block scraping and price often comes back empty — this is normal,
   not an error state. Don't show a scary message; just leave the fields blank.
5. Multi-select for which lists it belongs to, defaulting to the current one

## Delete vs. remove

Two visually distinct actions. "Remove from this list" is not "delete item" — conflating them
means people destroy items they meant to unfile. Removing an item from its last list soft-deletes
it, so warn in that case.

## Money

Format with `Intl.NumberFormat`, `es-CO` for COP and `en-US` for USD. **Always display the
original currency.** `priceUsdSnapshot` exists only to make the filter work across mixed
currencies — never render it.

## i18n

**Spanish-first.** Family members are the primary users. No hardcoded user-facing strings —
everything through i18n keys from day one, even while there's only one locale. Retrofitting is
miserable.

## Responsive

Mobile-first; most visitors arrive from a WhatsApp link on a phone. Verify at 375px, 768px,
1280px. Item grid: 1 / 2 / 3–4 columns. Touch targets ≥ 44px. Modals become full-screen sheets
on mobile.

## Styling

Tailwind. Extract a component when a pattern appears three times, not before. Component files
are colocated by feature under `src/app/`, not in a global `components/` dump.

Images use `next/image` pointed at `/media/{filename}`. Every item needs a placeholder — some
items will have no image, and that must look intentional rather than broken.

## Accessibility

Modals trap focus and close on Escape. Claim buttons need an `aria-label` naming the item —
"Mark as bought" alone is useless in a list of twenty. Never signal claimed state with color
alone.
