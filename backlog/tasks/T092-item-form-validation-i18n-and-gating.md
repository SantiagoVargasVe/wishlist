---
id: T092
title: "Item add/edit form — Spanish validation messages, live Save gating, clear the stale price/currency error"
epic: E11-post-deploy-ui-polish
status: done
depends_on: [T082, T083]
size: M
---

## Context

Three related defects in the add/edit-item form's validation, all reported from real usage and
all living in the same wiring (`src/lib/schemas/item.ts` + `add-item-form.tsx` /
`edit-item-form.tsx` / `price-fields.tsx`). Fixing them separately would thrash the same files,
so they're one task.

Read `docs/frontend/design-system.md` § "Forms — react-hook-form + Zod" and § "i18n", and
`CLAUDE.md` § "Conventions" (Spanish-first UI copy, no hardcoded user-facing strings).

### 1. Validation messages render in English (app is Spanish)

`createItemSchema` / `updateItemSchema` carry hardcoded **English** Zod messages — "Enter a
valid URL", "Enter a title", "Choose at least one list", "Enter a valid amount", "Amount must be
greater than zero", "Price and currency must be provided together". They reach the user verbatim
through `Field`'s `error` prop. Santiago's framing: *make it work in Spanish but keep the code in
English.*

There's an existing inconsistency to resolve, not extend: `src/lib/schemas/auth.ts` hardcodes
**Spanish** strings inline (breaks "code in English"); `wishlist.ts` and `item.ts` hardcode
**English** (breaks "Spanish-first UI"). Pick one mechanism. Suggested: schema `message` values
become stable i18n **keys** (e.g. `"wishlist.itemForm.errors.url"`), and a small helper resolves
a key → `t(key)` at render, passing through any string that isn't a known key (so
server-originated `VALIDATION_FAILED` messages and the not-yet-converted schemas keep working).
The helper can live in `src/lib/i18n/` and be applied where the form reads
`errors.<field>?.message`, or inside `Field`.

**Scope the conversion to the item schema + the add/edit item forms.** Leave `auth.ts` and
`wishlist.ts` for a follow-up — note it, don't widen this task.

### 2. Stale "Price and currency must be provided together" error (bug)

The object-level `.refine()` in `item.ts` attaches this message to `path: ["priceAmount"]`.
Enter a price with no currency and the error shows (correct). Then select a currency — the pair
is now complete, but the error **stays** until `priceAmount` itself changes again.

Root cause is the well-known react-hook-form + Zod cross-field-refinement gotcha: with
`reValidateMode` re-validating the *changed* field, a refinement error whose `path` points at a
*different* field (`priceAmount`) isn't recomputed when `priceCurrency` changes. `PriceFields`
already `useWatch`es `priceCurrency` for the T083 mask — the fix can hang off that: call the
form's `trigger("priceAmount")` when `priceCurrency` changes, or attach the pairing message to
both paths, or lift it to a form-level (`root`) error. Any of these is fine; the requirement is
that the error clears on the next render once both fields are set (or both cleared).

### 3. Save button enabled while the form is invalid (bug)

[T082](T082-add-item-form-gating.md) added `disabled={!isValid || isSubmitting}` with
`mode: "onTouched"`. Reported still-clickable with a currency set but no price, and with the
title empty. `formState.isValid` under `mode: "onTouched"` isn't reliably recomputed on every
relevant change — same revalidation-scope issue as #2: a cross-field refine failing on
`priceAmount` doesn't always flip `isValid` when `priceCurrency` is what changed.

Make `isValid` genuinely track the schema — simplest is `mode: "all"` (or `"onChange"`). T082
moved *away* from `onChange` only to stop the always-visible URL field flashing "Enter a valid
URL" on the first keystroke; preserve that by gating **error display** on the field being touched
(`fieldState.isTouched` / `formState.touchedFields`), not by loosening the validation mode. Only
`notes` is optional; `url` / `title` / `wishlistIds` (min 1) are required and
`priceAmount ⇔ priceCurrency` are paired.

## Acceptance criteria

- [ ] Every validation message shown by the add and edit item forms renders in Spanish — no
      English user-facing validation text remains in either form
- [ ] Message text lives in `src/lib/i18n/es.ts`; `src/lib/schemas/item.ts` references English
      identifiers/keys, not Spanish literals
- [ ] The key→text helper passes through unknown strings unchanged (covered by a unit test), so
      `auth.ts` / `wishlist.ts` / server error envelopes are unaffected
- [ ] Choosing a currency after entering a price (or entering a price after choosing a currency,
      or clearing one side) clears the "price and currency together" error on the next render
- [ ] The add-item Save button is disabled for each of: empty title, no list selected, price
      without currency, currency without price — and enabled once the form satisfies
      `createItemSchema`
- [ ] The edit-item Save button is disabled whenever `updateItemSchema` is unsatisfied, enabled
      when it is
- [ ] The URL field still does **not** show its "invalid URL" error on the first keystroke
      (T082 behavior preserved) — its error appears only after blur/touch
- [ ] Tests (`add-item-form.test.tsx`, `edit-item-form.test.tsx`, `price-fields.test.tsx`, plus
      a helper test): Spanish text asserted for at least the url / title / list / pair errors;
      Save stays disabled for each invalid permutation above and enables when valid; the pair
      error clears when the currency is chosen; the URL error is absent before blur

## Out of scope

Converting `auth.ts` / `wishlist.ts` messages (separate follow-up). The create / rename
wishlist forms. Server-side error-envelope copy. Adding a real second locale or a locale
switcher. Changing any *validation rule* — regexes, min/max, the pairing logic itself — only the
message text and when/where errors and the Save-disabled state are computed.

## Files likely touched

```
src/lib/schemas/item.ts
src/lib/i18n/es.ts
src/lib/i18n/errors.ts                        (new helper, or fold into t.ts)
src/lib/i18n/errors.test.ts                   (new)
src/app/_ui/field.tsx                         (if the helper is applied here)
src/app/w/[slug]/add-item-form.tsx
src/app/w/[slug]/edit-item-form.tsx
src/app/w/[slug]/price-fields.tsx
src/app/w/[slug]/add-item-form.test.tsx
src/app/w/[slug]/edit-item-form.test.tsx
src/app/w/[slug]/price-fields.test.tsx
```
