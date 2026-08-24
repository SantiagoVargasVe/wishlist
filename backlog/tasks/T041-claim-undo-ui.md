---
id: T041
title: Claim tokens in localStorage + undo UI
epic: E5-claims
status: done
depends_on: [T040, T052]
size: M
---

## Context

The interactive half of claiming: T052 renders claim state read-only (a "Reservado" badge, no
button). This task adds the actual "mark as bought" / undo button, wired to the endpoints T040
built, with the optimistic-update + localStorage-token pattern
[frontend/CLAUDE.md](../../docs/frontend/CLAUDE.md) § *Claim tokens* and
[design-system.md](../../docs/frontend/design-system.md) § *Data — TanStack Query* already specify:

> When a visitor claims an item, the response carries a `claimToken`. Persist it:
> `localStorage["wishlist:claims"] = { [itemId]: claimToken }`. That's what lets an anonymous
> visitor undo their own claim. On load, read it to decide whether an item shows "reserved by
> someone" or "you reserved this — undo".

> Claim toggles are optimistic: `onMutate` flips the cache, `onError` rolls back, `onSettled`
> invalidates.

## Acceptance criteria

- [ ] `src/lib/claim-tokens.ts` — `getClaimToken`/`setClaimToken`/`removeClaimToken` against
      `localStorage["wishlist:claims"]`, keyed by item id
- [ ] `src/lib/api/queries.ts` — `useWishlistQuery(slug, initialData)` (hydrated from the SSR
      props T052 already renders, so no extra round trip on load), `useClaimMutation(slug)`,
      `useUnclaimMutation(slug)`, all keyed on `queryKeys.wishlist(slug)`
- [ ] Claim: `onMutate` optimistically flips that item's `claimed` to `true` in the cache;
      `onError` restores the previous snapshot; `onSettled` invalidates to reconcile with the
      server (a 409 race resolves to the true state within one refetch, not stuck wrong)
- [ ] Unclaim mirrors it in reverse
- [ ] On a successful claim, the returned `claimToken` is written to localStorage; on a
      successful unclaim, it's removed
- [ ] Button state per item, decided from `claimed` (server truth) **and** the local token
      (client truth): unclaimed → "Marcar como comprado"; claimed and *we* hold the token →
      "Deshacer"; claimed and we don't → no button at all, just the badge
- [ ] Failure shows a toast (Base UI's `Toast` primitive, no new dependency) — a specific message
      for `ITEM_ALREADY_CLAIMED`, a generic one otherwise. Success needs no toast; the optimistic
      UI flip is the feedback
- [ ] Buttons disable while their mutation is in flight — no double-submit on a slow connection
- [ ] Tests: `claim-tokens.ts` read/write/remove; the claim mutation's optimistic flip and
      rollback-on-error (mocked `apiFetch`, no network)

## Out of scope

Anything already covered: the badge/read-only display (T052), the claim/unclaim endpoints (T040).
`hide_claims_from_owner` (T043) — this UI never renders for the owner regardless.

## Files likely touched

```
src/lib/claim-tokens.ts
src/lib/claim-tokens.test.ts
src/lib/api/queries.ts
src/lib/api/queries.test.tsx
src/lib/i18n/es.ts
src/app/_ui/toast.tsx
src/app/providers.tsx
src/app/_shell/app-shell.tsx
src/app/w/[slug]/visitor-view.tsx
src/app/w/[slug]/visitor-item-grid.tsx
src/app/w/[slug]/visitor-item-card.tsx
src/app/w/[slug]/claim-button.tsx
vitest.setup.ts
```
