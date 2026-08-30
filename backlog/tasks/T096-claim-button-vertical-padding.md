---
id: T096
title: "Visitor \"Marcar como comprado\" button — vertical padding / 44px touch target"
epic: E11-post-deploy-ui-polish
status: done
depends_on: [T041, T052]
size: S
---

## Context

Reported from real usage of the shared guest view: on the visitor card, the claim button's text
sits too close to the top and bottom edges. `ClaimButton`
(`src/app/w/[slug]/claim-button.tsx`) uses `Button size="sm"`, which is `h-9 px-3` — 36px tall,
no vertical padding.

Two reasons to fix it together: it looks cramped, and `docs/frontend/design-system.md`
§ "Responsive" requires touch targets ≥ 44px. `h-9` is 36px, and this is *the* control visitors
tap on a phone from a WhatsApp link.

## Approach

Give the claim / undo button ~44px min height with real vertical padding. Either:

- add a named `Button` size (e.g. `lg`: `h-11 px-4 text-sm`) and use it from `ClaimButton`, or
- a local `className` override on the claim button (`h-auto min-h-11 py-2.5`).

Prefer the named size only if it'll be reused; otherwise the local override is fine
(design-system.md: "Extract on the second use, not in anticipation of one"). The visitor card's
`gap` between the price line and the button can be nudged if it still reads tight after the
height change.

## Acceptance criteria

- [ ] The visitor "Marcar como comprado" / "Deshacer" button is ≥ 44px tall with visible
      vertical padding — the label no longer touches the top/bottom edge
- [ ] The "reserved by someone else" state (no button, just the "Reservado" badge) is unchanged
- [ ] The spacing between the button and the price line above still looks deliberate
- [ ] Owner-side action buttons (`item-actions.tsx`) are **not** restyled — unless a shared
      `Button` size was added, in which case owner buttons keep whatever size they already use
- [ ] `visitor-item-card.test.tsx` / `claim-button.test.tsx` updated only if they assert on
      classes; behavior tests unchanged

## Out of scope

The claim / unclaim flow and its optimistic logic. Owner action buttons ([T090](T090-owner-card-actions-layout.md)).
The existing `sm` / `md` `Button` sizes used elsewhere. The claim button's `aria-label`
(already correct per T041).

## Files likely touched

```
src/app/w/[slug]/claim-button.tsx
src/app/_ui/button.tsx                        (only if a named size is added)
src/app/w/[slug]/visitor-item-card.tsx        (only if the card gap needs a nudge)
src/app/w/[slug]/claim-button.test.tsx
```
