---
id: T030
title: SSRF-safe outbound fetch utility
epic: E4-og
status: todo
depends_on: [T001]
size: M
---

## Context

The app fetches user-supplied URLs to scrape Open Graph metadata. It runs on a home server
sharing a LAN with the router admin UI (`192.168.2.1`), Nextcloud (`:8080`), Immich (`:2283`),
and Minecraft. Without guards, a pasted `http://192.168.2.1/` is read back through a preview card.

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

## Out of scope

OG parsing (T031), the preview endpoint (T032), the image pipeline (T033). This task delivers the
primitive and its tests only.

## Files likely touched

```
src/server/net/safe-fetch.ts
src/server/net/ip-rules.ts
src/server/net/__tests__/safe-fetch.test.ts
```
