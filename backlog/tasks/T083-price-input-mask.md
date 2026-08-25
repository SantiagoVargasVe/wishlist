---
id: T083
title: Price input — thousands-separator masking while typing
epic: E9-post-mvp-ui
status: todo
depends_on: [T053]
size: S
---

## Context

Reported as "add a mask to the currency field so the number is easy to read" — the actual field
meant is `priceAmount` (`PriceFields`, shared by both add and edit forms): a plain-text input with
`inputMode="decimal"` and no formatting, so a price like `1300000` is genuinely hard to read at a
glance while typing. `priceCurrency` is already a `COP`/`USD` select and needs no masking.

## Design decisions (none prior — first pass at this field)

**Format for display, keep the raw digits as the submitted value.** `createItemSchema`'s
`priceAmountSchema` expects a plain string matching `^\d{1,12}(\.\d{1,2})?$` — no thousands
separators, no currency symbol. Whatever masking approach is used must keep that exact shape as
what actually reaches `register`/the schema; only the *displayed* value in the input should carry
separators. `src/lib/money.ts` already has an `Intl.NumberFormat`-based precedent for locale-aware
formatting (`formatMoney`) — worth checking whether a similar hand-rolled approach (format on
blur/change, strip back to raw digits on submit) is enough before reaching for a new dependency.

**New dependency needs justifying, per `architecture.md`'s dependency policy** — the current
intended set doesn't include an input-masking library. A hand-rolled formatter using
`Intl.NumberFormat` (matching the `money.ts` precedent already in the codebase) may well be
sufficient for two currencies with well-known separator conventions; only reach for a library
(e.g. `react-number-format`) if the hand-rolled version turns out to be genuinely awkward, and say
why in the PR if one gets added.

**Locale-aware separators, matching `formatMoney`'s own choice per currency** — COP amounts read
as `1.300.000` (period thousands, comma decimal, `es-CO` convention), USD as `1,300,000` (comma
thousands, period decimal, `en-US`) — the mask should follow whichever currency is currently
selected in `priceCurrency`, not a single hardcoded convention, so the input reads consistently
with what `formatMoney` will later render on the card.

## Acceptance criteria

- [ ] Typing digits into the price field displays thousands separators live, matching the
      currently-selected currency's convention (COP vs. USD)
- [ ] The value actually registered with react-hook-form / submitted to the API remains the raw
      numeric string `priceAmountSchema` expects — no separators, no currency symbol
- [ ] Switching the currency selector updates the displayed formatting of an already-entered
      amount to match the new currency's convention
- [ ] Pasting a pre-formatted number (e.g. `1,300,000` or `1.300.000`) is handled sensibly rather
      than rejected outright
- [ ] Tests: typed input displays separators, submitted value is the raw digit string, currency
      switch reformats an existing value, decimal amounts (`.50`) still work

## Out of scope

Changing `priceAmountSchema`'s validation rules or the `numeric(14,2)` storage format — this task
only changes how the value is *displayed* while being typed.

## Files likely touched

```
src/app/w/[slug]/price-fields.tsx
src/app/w/[slug]/price-fields.test.tsx
```
