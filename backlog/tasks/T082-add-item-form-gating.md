---
id: T082
title: Add-item form — gate fields behind a valid URL, gate Save behind validity
epic: E9-post-mvp-ui
status: todo
depends_on: [T053]
size: S
---

## Context

Two related requests from real usage of `add-item-form.tsx`:

1. Every field (title, notes, price, currency, lists) is editable from the moment the modal opens,
   before a URL has even been entered — the intended flow is paste URL → live preview prefills the
   rest → *then* the user reviews/edits. Nothing currently enforces that order.
2. The submit button is only ever disabled while `isSubmitting` — it's clickable (and will fail
   validation, showing field errors) even when required fields are empty.

## Design decisions

**Gate on the preview settling, not just on the URL being non-empty.** `useItemPreview` (the hook
that owns the paste-URL-get-preview-prefill flow) already tracks `preview.isFetching` and applies
prefilled values via a `setValue` effect keyed by `prefilledFor.current` — once per resolved URL.
If the other fields unlocked the instant the URL becomes syntactically valid (rather than once the
preview query settles), a fast typist could start editing `title` *before* the prefill effect
fires, and have their own input silently overwritten a moment later when `preview.data` arrives —
a real, easy-to-hit regression the naive version of this feature would introduce. Gating on
`preview.isFetching === false` (for the current valid URL) means by the time fields unlock, the
prefill (success or failure) has already run, so there's nothing left to clobber the user's typing.
A URL whose scrape fails should still unlock the rest of the form immediately once it fails —
non-negotiable #2 again: a failed OG scrape is not a reason to block the user from filling
everything in by hand.

**Save disabled on form validity, not just `isSubmitting`.** `useForm` isn't currently configured
with a validation `mode`, so `formState.isValid` isn't kept live as the user types. Add
`mode: "onChange"` (or `"all"`) and gate the submit button on `!isValid || isSubmitting`. `notes`
is the only genuinely optional field in `createItemSchema` — `url`, `title`, and `wishlistIds`
(min 1) are required, and `priceAmount`/`priceCurrency` are optional but paired (the schema's own
refinement already enforces that pairing, so `isValid` naturally reflects it).

**Scoped to the add form, not the edit form.** `EditItemForm` starts every field pre-populated
from the existing item — there's no "URL first" ordering problem there, since nothing needs
prefilling from a fresh scrape. The Save-button-validity gating, though, is worth applying to
`EditItemForm` too while touching this area — same mechanical fix (`mode: "onChange"` +
`disabled={!isValid || isSubmitting}`), no URL-gating behavior needed there.

## Acceptance criteria

- [ ] In `AddItemForm`, title/notes/price/currency/wishlist-list fields are disabled until the URL
      field holds a valid URL **and** the preview query for it has settled (succeeded or failed)
- [ ] A failed or image-less scrape still unlocks the rest of the form — never blocks manual entry
- [ ] A user typing in the URL field before the preview settles never has a field they've already
      started editing silently overwritten by a delayed prefill
- [ ] Save is disabled in `AddItemForm` until the form is valid per `createItemSchema` (title,
      wishlistIds, and the url-implies-prefill-happened state above); enabled once satisfied
- [ ] Save is disabled in `EditItemForm` until the form is valid per `updateItemSchema`
- [ ] Tests: fields start disabled, unlock after a successful preview, unlock after a failed
      preview, Save stays disabled with required fields empty, Save enables once they're filled

## Out of scope

Any change to the preview/prefill logic itself (`useItemPreview`) beyond what's needed to key
field-enablement off its existing `isFetching`/`data` state — this task consumes that hook, it
doesn't redesign it.

## Files likely touched

```
src/app/w/[slug]/add-item-form.tsx
src/app/w/[slug]/add-item-form.test.tsx
src/app/w/[slug]/edit-item-form.tsx
src/app/w/[slug]/edit-item-form.test.tsx
```
