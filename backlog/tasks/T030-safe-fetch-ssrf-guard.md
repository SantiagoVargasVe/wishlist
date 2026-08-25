---
id: T030
title: SSRF-safe outbound fetch utility
epic: E4-og
status: done
depends_on: [T001]
size: M
---

## Context

The app fetches user-supplied URLs to scrape Open Graph metadata, and it's self-hosted — so it
sits on a LAN with a router admin interface and other private services on RFC1918 addresses.
Without guards, a pasted private-range URL is read straight back through a preview card.

This is the highest-risk code in the repo. Everything in `src/server/og/` depends on it, so it
gets built first and tested hard.

**Read [security.md](../../docs/context/security.md) fully before starting.** It has the complete
denylist and the reasoning behind each rule.

## Acceptance criteria

- [ ] `safeFetch(url, opts)` exported from `src/server/net/safe-fetch.ts`; it is the **only**
      place in the codebase that makes outbound HTTP
- [ ] Rejects any scheme other than `http:` / `https:`
- [ ] Resolves DNS, validates **every** returned address, then **connects to the validated IP**
      with the original `Host` header — resolve-then-hand-to-`fetch()` re-resolves and is a
      DNS-rebinding TOCTOU
- [ ] Denies IPv4 loopback, private, link-local, CGNAT, this-network, multicast; IPv6 `::1`,
      `fe80::/10`, `fc00::/7`; and v4-mapped v6 (`::ffff:0:0/96`) with the embedded v4 checked
- [ ] Follows at most 3 redirects, **re-validating the target on every hop**
- [ ] Enforces caller-supplied content-type allowlist, max body size, and a 5s timeout
- [ ] Never surfaces the underlying network error — callers get a generic failure, because
      `ECONNREFUSED` vs. timeout reveals which internal ports are open. Real detail goes to logs.
- [ ] Tests cover: each denied range, public-URL-redirecting-to-private, DNS rebinding (resolver
      returns public then private), non-HTTP schemes, oversize body, timeout, wrong content-type
- [ ] No network access in tests — stub the resolver and the socket layer

## Bugs found via live verification (after this task's own tests were already green)

A logged-in user pasting a real Amazon product link got `ogStatus: "ok"` with every field
null — no title, no image, no price, indistinguishable from "this page genuinely has no
metadata." It wasn't. Two real bugs in `defaultTransport`, invisible to every test here because
they all stub the transport or the socket layer, per this task's own "no network access in
tests" rule — confirmed against Amazon's real CDN, not assumed:

- **No response decompression, ever.** Amazon's CloudFront gzips its HTML response even when the
  request sends no `Accept-Encoding` at all — compression isn't reliably opt-in in practice.
  `defaultTransport` handed the raw compressed bytes straight through; `.toString("utf-8")`
  downstream (`preview.ts`) turned them into garbage, and the parser correctly found zero matching
  tags in what wasn't real HTML. Fixed by declaring `Accept-Encoding: gzip, deflate, br` and
  piping the response through the matching `zlib` decompressor based on the actual
  `content-encoding` header returned — never trusting that a server won't compress just because
  it wasn't asked to.
- **A missing `Content-Type` header was rejected the same as a wrong one.** Amazon sometimes
  serves the genuine product page — a real `<!doctype html>` body, 1.4MB of it — with no
  `Content-Type` header at all. The allowlist check treated absence as failure. Fixed to treat a
  *missing* header as unknown (allowed through) while still rejecting one that's *present* and
  doesn't match — a present-but-wrong content type is a real signal; silence isn't.

Both fixed in `fix/T030-gzip-decompression`, with new tests exercising the real `zlib` module and
a real loopback server (the existing pattern this file's tests already use for the pinned-`lookup`
wiring), not mocks of the fix itself.

**Not a bug, a separate limitation, left alone:** even after both fixes, this specific Amazon page
has no `og:image`, `twitter:image`, or JSON-LD `Product` block at all for a generically-identified
client — the image lives only in a `data-a-dynamic-image` JSON attribute, Amazon's own
proprietary lazy-load format, not something any standards-based parser would recognize. (WhatsApp
renders a card for the same link because Amazon almost certainly allowlists WhatsApp's crawler
User-Agent for richer metadata — a policy on their end, not a bug in this pipeline.) Parsing that
attribute as an Amazon-specific fallback is a real, separate feature decision, not a bug fix —
worth its own task if it turns out to matter, not folded in here.

## Out of scope

OG parsing (T031), the preview endpoint (T032), the image pipeline (T033). This task delivers the
primitive and its tests only — nothing calls it yet, so there's no UI or API surface to verify.

**Deviation:** the "original `Host` header" line above is satisfied differently than it reads.
`safeFetch` doesn't rewrite the URL to the validated IP and set `Host` manually — it passes
Node's `http`/`https request()` a custom `lookup` option that resolves to the pre-validated
address and nothing else, while `url` (hostname, path, TLS SNI) stays exactly as given. Node
calls `lookup` exactly once per connection, so this is the same fix (resolve, validate, connect
to *that* address, no second resolution possible) with less manual header-juggling. Also:
`safeFetch` takes `timeoutMs`/`userAgent` as caller-supplied options rather than reading
`config.OG_FETCH_TIMEOUT_MS`/`config.OG_USER_AGENT` itself — keeps this module fully decoupled
from the app's environment schema, so its tests don't need `DATABASE_URL`/`AUTH_SECRET`/`APP_URL`
satisfied just to exercise a fetch guard. T031/T032 pass those config values in when they call it.

## Files likely touched

```
src/server/net/safe-fetch.ts
src/server/net/safe-fetch.test.ts
src/server/net/ip-rules.ts
src/server/net/ip-rules.test.ts
```
