---
id: T081
title: "Fix: a newly-added item's image doesn't appear until page reload"
epic: E9-post-mvp-ui
status: done
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

- [x] Adding an item whose OG scrape found a real image shows that image in the list without
      requiring a manual page reload
- [x] The chosen approach doesn't reintroduce "the save waits on a slow/blocked image fetch" —
      whatever non-negotiable #2 trade-off is kept or changed, it's a stated decision, not an
      accident
- [x] Tests cover whatever mechanism is chosen (a poll/refetch path, an awaited download path, or
      an optimistic-state path)

## Chosen approach: delayed catch-up refreshes, client-side

Went with the first option — a couple of extra, delayed `router.refresh()` calls in
`add-item-form.tsx`'s `onSubmit`, fired only when the submitted `input.imageUrl` was actually
present (i.e., a download really was kicked off server-side):

```ts
if (input.imageUrl) {
  window.setTimeout(() => router.refresh(), 1500);
  window.setTimeout(() => router.refresh(), 3500);
}
```

**Why not "await the download" (the second option):** re-read T033's task file first, as this
task's own note asked. `downloadItemImage()` runs async "after the item row is created — a slow
retailer CDN must never delay the save" is one of T033's own *explicit, already-tested acceptance
criteria* — not an incidental side effect. Awaiting it here would directly reopen that criterion:
a slow or blocked image host would make a normally-instant save visibly hang for up to
`OG_FETCH_TIMEOUT_MS`. Not worth it for a UI polish task.

**Why not the optimistic-loading-state option:** genuinely more correct (no guessed delay), but
needs new client state to track "this item was just created and is still enriching," which is a
bigger surface for a `size: S` task than two delayed refreshes. Worth revisiting if the delayed
refreshes prove unreliable in practice (e.g., a consistently-slow image host makes 3.5s not enough)
— not chosen now because there's no evidence of that yet.

**Why two delayed refreshes, not one:** a single fixed delay is a guess either way; two catches
more of the real-world download-time distribution than one without adding real complexity — just
one more `setTimeout` call.

Live-verified in a browser end to end (not just at the unit-test level): added a real item
(`developer.mozilla.org`, a real image), watched it appear with **no image** immediately after
the first refresh (reproducing the reported bug exactly), then watched the real MDN image appear
on its own about two seconds later — no manual reload.

## Out of scope

Any change to `downloadItemImage()`'s own retry/timeout behavior (T033) — this task is about the
client seeing the *eventual* result, not making the download itself faster or more reliable.

## Files touched

```
src/app/w/[slug]/add-item-form.tsx
src/app/w/[slug]/add-item-form.test.tsx
```
