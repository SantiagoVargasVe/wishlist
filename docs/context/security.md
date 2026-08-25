# Security

**Read this before touching anything that fetches a URL, handles auth, or accepts anonymous
writes.**

## SSRF — the highest-risk surface in this app

This app fetches user-supplied URLs, and it is designed to be self-hosted — which means it
typically runs on a LAN alongside a router admin interface, other self-hosted services, and
their management ports, none of which are reachable from the internet.

Without guards, a visitor pastes a private-range URL and reads an internal admin page back
through an item preview card. Docker's internal networks are reachable the same way.

Assume the deployment host can reach sensitive things on RFC1918 addresses. The guard below is
what stands between a pasted URL and all of them.

### Every outbound fetch goes through `src/server/net/safe-fetch.ts`

No exceptions. Not for OG pages, not for images, not "just this once for debugging."

The guard must:

1. **Allow only `http:` and `https:`.** Rejects `file:`, `gopher:`, `ftp:`, `data:`.
2. **Resolve DNS first, then check every resolved address** against the denylist below.
3. **Pin the connection to the validated IP.** Resolve, validate, then connect to *that address*
   with the original `Host` header. Validating a hostname and then handing the URL to `fetch()`
   re-resolves it — a DNS-rebinding TOCTOU where the second lookup returns a private address.
4. **Re-validate on every redirect.** Max 3 hops. A public URL that 302s to `169.254.169.254` is
   the oldest trick there is.
5. **Cap and timeout.** 5s connect/read, 2MB for HTML, 10MB for images.
6. **Enforce content type.** `text/html` for pages, `image/*` for images.

Denied ranges — IPv4 and IPv6, both:

```
127.0.0.0/8      loopback          10.0.0.0/8       private
169.254.0.0/16   link-local        172.16.0.0/12    private
100.64.0.0/10    CGNAT             192.168.0.0/16   private
0.0.0.0/8        this-network      224.0.0.0/4      multicast
::1  fe80::/10  fc00::/7  ::ffff:0:0/96 (v4-mapped — check the embedded v4 too)
```

`169.254.169.254` deserves a specific mention: cloud metadata. Not reachable today, but this
guard should survive the app being moved.

### Defense in depth

- `POST /api/preview` is **authenticated**. Only logged-in users add items, so the surface is
  never anonymous. Cheapest mitigation available — don't regress it.
- Consider running the fetcher on an isolated Docker network with no route to the host's LAN
  subnet, so a guard bug still can't reach it.
- Never return raw fetch errors to the client. `ECONNREFUSED` vs timeout tells an attacker
  which internal ports are open. Return a generic failure.

## Authentication

- **Argon2id** for passwords. Not bcrypt, not SHA-anything.
- JWT in an **httpOnly, Secure, SameSite=Lax** cookie. Not `localStorage` — any XSS reads it.
- 30-day expiry, signed with `AUTH_SECRET` (32+ random bytes).
- `SameSite=Lax` covers CSRF for the state-changing routes here. If a cross-site POST is ever
  needed, add a token — don't loosen the cookie.
- Login failures are generic: "email or password is incorrect", never "no such user".
- Registration is **invite-gated**. Single-use codes.

## Anonymous claims

Anyone with the link can write to the claim endpoint. That's the product working as intended,
so the controls are about griefing, not access:

- The unguessable slug is the primary control. Claims are scoped under `/api/w/:slug/...` — you
  cannot claim an item you weren't given a link to.
- `claim_token` returned to the claimer makes the action reversible without an account.
- The unique constraint on `item_claims.item_id` prevents double-claim races at the DB level.
  A read-then-write in application code has a race window; don't write one.
- Rate limits per IP and per slug (see [api-contract.md](api-contract.md)) — the Postgres
  token-bucket limiter is the **only** line of defense here, not a backstop. Cloudflare's rate
  limiting rules turned out to be a paid-plan feature, not available on this domain's plan
  (checked 2026-08-25) — see "Known accepted risks" below.

**The real threat is a single griefer marking everything bought, not a botnet.** Reversibility
and a per-slug cap matter more than raw request throttling.

## Secrets

- `.env` is gitignored. `.env.example` carries names and dummy values only.
- On a server: keep `.env` beside `docker-compose.yml`, `chmod 600`.
- Never log secrets, tokens, or password hashes. Never put `claim_token` in a URL — it lands in
  logs and `Referer` headers. Request body only.
- If a secret is ever committed, rotate it. Removing the commit is not enough.

## Input handling

- Zod on every route boundary. Parse, don't validate-and-hope.
- Drizzle's query builder parameterizes — never build SQL with template strings.
- `/media/:filename` must match `^[0-9a-f-]{36}\.webp$` before touching the filesystem. Never
  join user input onto a path.
- Item titles and notes are user content rendered on a public page. React escapes by default —
  do not reach for `dangerouslySetInnerHTML`.
- OG metadata is **untrusted scraped content**. A hostile page can return a 10MB `og:title` or
  embedded markup. Truncate, strip, treat exactly like user input.

## Privacy

- The public list view exposes `displayName` and nothing else. No email, no user id, no other
  lists.
- Don't reveal *who* claimed an item — visitors see "reserved", not a name. Two relatives
  shouldn't learn what each other bought.
- Store images locally rather than hotlinking, which also stops leaking your visitors' traffic
  and `Referer` to retailers ([ADR-0004](../adr/0004-store-images.md)).

## Known accepted risks

| Risk | Why it's accepted |
|---|---|
| Slug leak = full list access | Capability URLs are the design. Slugs are unguessable; rotation can be added if needed. |
| Scraping from the host's own IP | Low volume, on-demand only, cached. No scheduled crawling — that's part of why the cron-refresh design was rejected. |
| No backups | Deliberate — hobby project, data is reconstructable. A corrupted database means re-adding items, not losing anything irreplaceable. |
| No edge-layer rate limiting (T064 not done) | Cloudflare's rate limiting rules are a paid-plan feature; not worth paying for at this scale. The Postgres token-bucket limiter (`src/server/rate-limit/`) is the sole defense — acceptable given the threat model is a single griefer, not a botnet (see above). Free options like Bot Fight Mode weren't evaluated; revisit if abuse actually shows up. |
