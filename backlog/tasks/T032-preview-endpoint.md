---
id: T032
title: POST /api/preview + og_cache
epic: E4-og
status: done
depends_on: [T030, T031]
size: M
---

## Context

Wires `safeFetch` (T030) and `parseProductMetadata` (T031) into the endpoint T053's add-item
modal will call. Read [api-contract.md](../../docs/context/api-contract.md) § *Preview* for the
exact request/response shape, and [security.md](../../docs/context/security.md) — this is
authenticated specifically so the SSRF surface (a URL fetch) is never exposed to an anonymous
caller.

## Design decisions (no prior spec existed)

**Only successful scrapes are cached.** A failed scrape (`ogStatus: "failed"`) is a normal
outcome — roughly half of retailers block server-side scraping — and per data-model.md's own
framing that's often transient, not permanent. Caching a failure for `OG_CACHE_TTL_HOURS` (7 days
by default) would mean a site that started blocking bots for an hour stays "failed" in this app
for a week after it recovers. The per-user rate limit is the actual abuse control; the cache is
purely about not re-scraping a URL that was pasted again, which only matters once there's
something worth reusing.

**Unsupported currencies are dropped here, not in the parser.** T031's parser deliberately
returns whatever currency it finds, unfiltered — a caller decision, per that task's own scope
note. This is that caller: `createItemSchema` only accepts `COP`/`USD`, so a parsed price in any
other currency is nulled out here rather than prefilling a form field the save flow would reject.

## Acceptance criteria

- [ ] `POST /api/preview` — authenticated (`requireUserId`), `{ url }` →
      `200 { title, imageUrl, price, currency, siteName, ogStatus }`, every field `string | null`
      except `ogStatus` (`"ok" | "failed"`)
- [ ] A failed fetch/parse is `200 { ogStatus: "failed", ...all null }`, **never** a 4xx/5xx — the
      scrape is a prefill suggestion, never a gate (root CLAUDE.md non-negotiable #2)
- [ ] `og_cache` table: `url_hash` (sha256 of the URL with its fragment stripped) primary key,
      `payload` jsonb, `fetched_at`. A hit within `OG_CACHE_TTL_HOURS` skips the fetch entirely
- [ ] Rate limited via the existing `policies.preview` (30/hour), keyed per user — not per IP,
      since this route requires auth
- [ ] A parsed price whose currency isn't `COP` or `USD` is dropped (both `price` and `currency`
      null) rather than prefilling a value the item-creation form can't accept
- [ ] Tests: cache hit skips `safeFetch` entirely (assert the mock wasn't called); cache miss
      fetches, parses, and writes the cache; a `safeFetch` failure resolves to
      `{ ogStatus: "failed" }` rather than throwing; an unsupported-currency price is dropped;
      an expired cache row (older than the TTL) is treated as a miss

## Bugs found via live verification, fixed in T030/T031's already-merged files

Every prior OG-pipeline test stubbed `safeFetch`'s transport or `parseProductMetadata` entirely,
so neither had ever been exercised against a real fetch until this task's manual verification —
by design (no network in unit tests), but it meant two real bugs were invisible until now:

- **`safeFetch` threw on every real public host.** Node 20+ enables `autoSelectFamily` (Happy
  Eyeballs) by default, which calls the pinned `lookup` option with `{ all: true }` and expects
  an array-of-addresses callback — `pinnedLookup` only implemented the single-address form. Fixed
  in `safe-fetch.ts`; the loopback test in T030 now connects via the hostname `localhost` rather
  than a bare IP literal specifically so it exercises this path (a literal IP skips resolution
  entirely and never triggers it — confirmed empirically, which is also why the original test
  suite never caught this).
- **MDN's own docs pages write OG tags as `<meta name="og:title">`**, not the spec's
  `property="og:title"`. `parser.ts`'s OG selectors now check both attributes.

## Out of scope

The add-item modal that calls this (T053). Downloading the image (T033) — this only returns the
scraped `imageUrl`; nothing is fetched or stored to disk here. `og_cache` cleanup — rows aren't
pruned by this task (nothing here needs it yet; revisit if the table's growth ever matters).

## Files likely touched

```
src/server/db/schema.ts
src/server/db/migrations/
src/server/og/preview.ts
src/server/og/preview.test.ts
src/lib/schemas/preview.ts
src/app/api/preview/route.ts
```
