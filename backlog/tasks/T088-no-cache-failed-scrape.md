---
id: T088
title: Stop treating a bot-wall or error page as a successful scrape
epic: E10-preview-reliability
status: todo
depends_on: [T030, T032]
size: S
---

## Context

Found in production on 2026-08-25, in the live `og_cache` table:

```json
{ "price": null, "title": "Access Denied", "currency": null,
  "imageUrl": null, "ogStatus": "ok", "siteName": "www.bershka.com" }
```

That is a retailer's **HTTP 403 page** stored as a *successful* scrape. Anyone pasting that link
got `Access Denied` prefilled as their item's title, and would keep getting it for
`OG_CACHE_TTL_HOURS` (168h — a week), because a cache hit skips the fetch entirely. A second row
had every field null, also `"ok"`.

Two independent defects combine to produce this:

1. **`safeFetch` does not reject non-2xx responses.** It special-cases 3xx for redirects
   ([safe-fetch.ts](../../src/server/net/safe-fetch.ts), the `statusCode >= 300 && < 400` branch)
   and otherwise returns whatever came back. A 403 whose body is `text/html` therefore passes the
   content-type allowlist and is handed to the parser as though it were a product page.
2. **`getPreview()` caches on `ogStatus` alone**, which `scrape()` sets to `"ok"` whenever
   parsing didn't throw — regardless of whether a single field was extracted. See
   [preview.ts](../../src/server/og/preview.ts): `if (result.ogStatus === "ok") await writeCache(…)`.

Fixing only (1) is not enough. A CDN bot-manager challenge returns **HTTP 200** with a real HTML
body (`bm-verify`, `<title>&nbsp;</title>`), so it would still sail through as a successful,
cacheable, entirely empty scrape. [ADR-0010](../../docs/adr/0010-preview-user-agent.md) documents
that shape and why it is more dangerous than an outright 403 — it looks like success.

Read [api-contract.md](../../docs/context/api-contract.md) § *Preview* for the contract that must
not change: a failed scrape is still `200` with `ogStatus: "failed"` and null fields, **not** an
error. This task changes what counts as failed, not how failure is reported.

## Acceptance criteria

- [ ] `safeFetch` rejects a non-2xx, non-redirect response as a `SafeFetchError`, so a 403/404/500
      body never reaches a parser. 3xx redirect handling is unchanged
- [ ] The rejection carries no upstream detail to the client — security.md § *Defense in depth*:
      distinguishing 403 from 500 from a timeout tells an attacker about internal state. Status
      may go to `console.error`, never to the response
- [ ] `getPreview()` only writes to `og_cache` when the scrape actually yielded something usable
      — at minimum a `title` **or** an `imageUrl`. An all-null result is returned to the caller
      but **not** persisted
- [ ] An all-null-but-200 response (the challenge-page shape) is therefore not cached either,
      even though nothing threw
- [ ] A previously-cached bad row stops being served as soon as it is deleted — i.e. no other
      layer re-caches it. Verify by deleting a row and re-requesting
- [ ] `ogStatus: "failed"` responses are still `200` with null fields, and still never cached.
      The API contract is unchanged
- [ ] Tests: a 403 with an HTML body resolves to `failed` and writes no cache row; a 200 whose
      parse yields nothing writes no cache row; a 200 with a title but no image **is** cached
      (a legitimately image-less page is still a useful cache entry); a successful full parse is
      cached exactly as today
- [ ] Existing `safe-fetch` and `preview` tests still pass unmodified except where they asserted
      the old non-2xx behaviour — if any did, say so explicitly in the PR

## Out of scope

- **Negative caching.** Not caching failures means a retry always re-fetches, which is what makes
  a fix like [T087](T087-preview-user-agent.md) take effect immediately. Do not add a failure TTL
  here; it needs its own reasoning about rate limits.
- Detecting *which* bot wall a page came from, or reporting "this site blocks previews" in the
  UI. Worth doing, but a separate change with its own copy and i18n.
- Retrying, backing off, or falling back to another fetch strategy.
- The User-Agent ([T087](T087-preview-user-agent.md), done) and the manual image fallback
  ([T086](T086-manual-image-fallback.md)). This task is independent of both.
- Purging existing bad rows. That is a one-off operational step, not code — though the PR should
  note that deployed instances may need it, since a bad row outlives the fix by up to a week.

## Files likely touched

```
src/server/net/safe-fetch.ts
src/server/net/safe-fetch.test.ts
src/server/og/preview.ts
src/server/og/preview.test.ts
```
