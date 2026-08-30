---
id: T089
title: "Owner item card — cover (not contained) images, matching the visitor card"
epic: E11-post-deploy-ui-polish
status: done
depends_on: [T080]
size: S
---

## Context

Reported from real usage: the same item looks different on the owner/edit view than on the
shared guest view. The owner card (`src/app/w/[slug]/item-card.tsx`) renders its image with
`object-contain` inside a fixed `h-48` box; the visitor card
(`src/app/w/[slug]/visitor-item-card.tsx`) uses `object-cover` in an `aspect-square` box. So a
non-square product photo is letterboxed for the owner and edge-to-edge for the visitor. Santiago
wants the owner card to match the guest: **`object-cover`**.

This reverses one of [T080](T080-item-card-layout.md)'s explicit design decisions —
`object-contain` was chosen there specifically so a non-square photo is *never* cropped. That was
a task-level call, not an ADR, so overriding it just needs stating: the owner is looking at their
own list next to the link they share, and consistency with what guests see now matters more than
never cropping. Read T080's "Design decisions" section before starting so the reversal is
deliberate.

Keep the rest of T080 intact — the fixed card height and `h-48` image box exist to keep every
card in a grid row the same height regardless of title length, and that reasoning is unchanged.
Only the object-fit changes.

## Acceptance criteria

- [ ] `item-card.tsx`'s image uses `object-cover` — fills the `h-48` box, cropping overflow —
      identical to `visitor-item-card.tsx`
- [ ] The fixed card height and `h-48` image box from T080 are untouched; the only change is
      `object-contain` → `object-cover`
- [ ] The "no image" placeholder state (centered `wishlist.noImage` text on `bg-muted`) is
      unchanged
- [ ] `item-card.test.tsx` updated if it asserts on the image's class list

## Out of scope

The visitor card (already `object-cover`). Revisiting T080's fixed-height decision. The add/edit
form image picker (T086) and its drop-zone preview. Any change to how images are stored or sized
server-side.

## Files likely touched

```
src/app/w/[slug]/item-card.tsx
src/app/w/[slug]/item-card.test.tsx
```
