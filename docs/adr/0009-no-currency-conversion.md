# ADR-0009 — No currency conversion, no cross-currency price filter

**Status:** Accepted · 2026-08-24 · supersedes the money-handling part of T020/T023

## Context

Items can be priced in COP or USD. The original design ([data-model.md](../context/data-model.md)'s
first draft, [product.md](../context/product.md)) called for a price filter that worked across a
list mixing both currencies, and to make that possible, `items` carried a `price_usd_snapshot` and
`fx_rate_used`, computed from a configured rate (`FX_COP_PER_USD`) at write time.

## Decision

Removed both columns. `price_amount` and `price_currency` are the only money fields on an item,
stored and displayed exactly as entered. There is **no cross-currency price filter** in this
product — COP and USD items are simply shown as entered, and any filtering is currency-scoped or
skipped, a decision left to whatever the frontend actually builds (T056).

## Why the original design was wrong, not just imprecise

A write-time snapshot doesn't just go *stale* — it's inconsistent with itself the moment a second
currency-bearing item exists. An item saved in January gets a snapshot computed from January's
rate; one saved today gets today's. Comparing those two snapshots against each other — which is
the entire point of a shared unit for filtering — is comparing numbers produced by two different
conversions. The design didn't degrade gracefully toward inaccuracy; it was never actually
comparable across items in the first place.

A live rate applied uniformly at read time (rather than stored per item) would have avoided that
specific bug. It was considered and rejected too: COP/USD moves enough over weeks that a
"currently accurate" conversion still invites a filter UI implying a precision the underlying
number doesn't have, for a feature serving a handful of items across a few family members. The
honest trade highlighted in the discussion that led here: an accurate-looking filter that is
sometimes wrong is worse UX than no filter, because a wrong filter hides items a person was
looking for. No conversion, ever, sidesteps that entirely — the owner reads "150.000 COP" or "$40"
and interprets it themselves, the way anyone already does when a list mixes currencies.

## Consequences

- `items.price_usd_snapshot` and `items.fx_rate_used` are dropped (migration `0004`). Neither
  column had live production data — the schema had only just been deployed with zero real items —
  so this was a clean removal, not a data migration.
- `FX_COP_PER_USD` is removed from `config.schema.ts`, `.env.example`, and the production compose
  file. Nothing in the app reads an FX rate anywhere.
- `src/lib/money.ts` (the pure conversion helper) is deleted. Nothing calls it; keeping an unused
  module "for later" contradicts the point of this ADR — there is no later planned use.
- T056 ("Price + wishlist filters" in the original backlog) is now wishlist-selection only. If a
  price filter is wanted later, scope it per-currency (two ranges, or a currency toggle) rather
  than resurrecting a shared numeric comparison — that's what reopens this exact problem.
- Documented in [product.md](../context/product.md) as explicitly out of scope for v1, not merely
  deferred, so it doesn't get quietly re-added by a future task assuming it was just unbuilt.
