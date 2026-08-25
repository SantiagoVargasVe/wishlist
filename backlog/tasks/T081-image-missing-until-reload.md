---
id: T081
title: "Fix: a newly-added item's image doesn't appear until page reload"
epic: E9-post-mvp-ui
status: todo
depends_on: [T033]
size: S
---

## Context

Reported from real usage: add an item whose preview clearly shows an image, submit, and the item
appears in the list with **no image** — reloading the page then shows it correctly.

Root cause, confirmed by reading the code (not yet live-reproduced with logging, but the shape of
the bug is unambiguous from `T033`'s own design):

`POST /api/items` (`src/app/api/items/route.ts`) does

```ts
if (item.sourceImageUrl) {
  void downloadItemImage(item.id, item.sourceImageUrl);
}
```

— deliberately **unawaited**, per T033's own task file: "fire-and-forget... a slow image download
must never delay the item actually saving" (the same non-negotiable #2 reasoning: the OG pipeline
may never block a save). So `POST /api/items` returns, and the client's `router.refresh()`
(`add-item-form.tsx`'s `onSubmit`) re-fetches the item list **before** `downloadItemImage()` has
necessarily finished writing the file and updating `image_path` on the row — the freshly-created
item legitimately has no `image_path` yet at that exact moment. A later page load re-fetches after
the download has long since finished, so it looks fixed.

This is the correct trade-off for the *save* itself (non-negotiable #2 stays true — the item
saves immediately, image or not) but the *UI* has no way to notice "the image showed up a moment
later" without re-fetching, so it looks stuck missing until a manual reload.

## Design decisions

**Needs deciding at implementation time — a few real options, not an obvious single answer:**

- **Client-side poll/refetch once, shortly after create**, only for the item(s) just added, until
  `imagePath` appears or a short timeout elapses. Simple, no new server surface, but is a guess at
  timing (image download is usually fast — a `safeFetch` + `sharp` resize — but not bounded).
- **Return more from `POST /api/items`** — e.g. have the route *await* the download when the
  request already has an `imageUrl` to fetch, since in practice these downloads are typically
  sub-second. Changes the non-negotiable #2 trade-off T033 made on purpose; would need to weigh
  "slightly slower save" against "image not appearing to work" as a real regression to that
  decision, not something to flip casually.
- **A lightweight "item just created, still enriching" client state** (optimistic UI showing a
  loading placeholder in the image slot until the next natural revalidation) — most polish, most
  new state to manage.

Whoever picks this task up should read T033's task file in full before choosing — the
fire-and-forget design was deliberate, so the fix should address the *visibility* gap, not
silently undo the reasoning behind it without saying so.

## Acceptance criteria

- [ ] Adding an item whose OG scrape found a real image shows that image in the list without
      requiring a manual page reload
- [ ] The chosen approach doesn't reintroduce "the save waits on a slow/blocked image fetch" —
      whatever non-negotiable #2 trade-off is kept or changed, it's a stated decision, not an
      accident
- [ ] Tests cover whatever mechanism is chosen (a poll/refetch path, an awaited download path, or
      an optimistic-state path)

## Out of scope

Any change to `downloadItemImage()`'s own retry/timeout behavior (T033) — this task is about the
client seeing the *eventual* result, not making the download itself faster or more reliable.

## Files likely touched

```
src/app/api/items/route.ts
src/app/w/[slug]/add-item-form.tsx
src/app/w/[slug]/hooks/use-item-preview.ts
src/lib/api/queries.ts
```
