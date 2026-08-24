# ADR-0005 — Claims hidden from the owner by default, with a per-list toggle

**Status:** Accepted · 2026-08-23

## Context

Anyone with a list's link can mark an item bought. Whether the *owner* sees those marks is a
product decision, not a technical one.

Showing them is more useful (you know what's coming, you avoid duplicates). Hiding them preserves
the surprise, which is what gift registries like Amazon's do.

## Decision

`wishlists.hide_claims_from_owner`, **defaulting to `true`**, per list.

## Why

Both modes are legitimate for different lists — a birthday list wants secrecy, a "things I need
for the apartment" list doesn't. One boolean covers both, and the default protects the case where
getting it wrong is unrecoverable: you can't un-spoil a surprise.

## Consequences

- Claim data is **stripped server-side** in `GET /api/me` for lists with the flag on. The
  response carries no hint a claim exists — no count, no boolean, no gap in ordering. Sending it
  and hiding it in the client is not acceptable; devtools are one keypress away.
- `GET /api/me` and `GET /api/w/:slug` therefore **cannot share a handler**. The public view
  exposes claims and hides everything else; the owner view does the reverse. Merging them is
  exactly how this leaks.
- Item ordering and counts must not shift based on claim state in owner view, or the absence
  becomes a signal.
- Visitors always see claim state — that's the point — but never *who* claimed. Two relatives
  shouldn't learn what each other bought.
