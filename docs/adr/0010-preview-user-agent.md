# ADR-0010: Identify the preview fetcher as a WhatsApp-compatible crawler

**Status:** Accepted · 2026-08-25

## Context

Pasting a link from several large retailers produced a card with no image. Since an image is the
one field a user cannot reasonably type in by hand, this was the single biggest complaint from
real use of the deployed app.

The cause is not the parser. It is that the HTML never arrives. Several retailers front their
sites with CDN bot management that decides on `User-Agent` **at the edge, before the request
reaches their origin**. Measured against a real product page:

| `User-Agent` sent | Response |
|---|---|
| `WishlistBot/1.0` (ours) | `403 Access Denied`, ~450 bytes, never reaches origin |
| a real browser UA, `Mozilla/5.0`, or none at all | `200` — but a JavaScript bot-manager challenge page, ~2.3 KB |
| anything beginning `WhatsApp/` | `200`, the full page, `og:image` present |

Three findings shaped this decision, each measured rather than reasoned about:

1. **No honest self-identifying UA works.** `facebookexternalhit`, `Twitterbot`, `Slackbot`,
   `Discordbot`, `TelegramBot`, `LinkedInBot`, `Applebot` and
   `Wishlist/1.0 (+https://…)` are all refused. The allowlist here is narrow and specific.
2. **TLS fingerprinting is not involved.** A genuine Chrome-124 TLS fingerprint still gets the
   challenge; a WhatsApp UA over ordinary TLS gets the page. Only the `User-Agent` matters. And
   the challenge is real JavaScript, so no HTTP client can pass it however well disguised —
   that would take an actual browser engine.
3. **The middle row is a trap.** A browser-like UA returns HTTP 200 and parses without error, so
   it reads as success while carrying no metadata — and `getPreview()` would cache that as
   `ogStatus: "ok"` for `OG_CACHE_TTL_HOURS`. Sending a browser UA is worse than sending nothing.

Coverage measured across 14 retailers, classifying the response body rather than the status code:
the current UA gets usable HTML from **5**, a WhatsApp-prefixed UA from **12**. The two failures
(H&M, Uniqlo) refuse every UA tried and were already failing.

## Alternatives considered

- **Do nothing, rely on the manual image fallback (T086).** Kept regardless — it is the only
  thing that works on sites we cannot fetch at all, and it is what comparable products do. But it
  puts work on the user for sites that a UA string alone would fix.
- **A headless browser.** Would clear the JavaScript challenge. Rejected for now: hundreds of MB
  of Chromium on a home server, ongoing memory and restart management, and an SSRF surface that
  `safe-fetch`'s DNS-pinning no longer covers — a real cost against
  [security.md](../context/security.md)'s central guard.
- **A commercial unblocking service.** Rejected on both economics and privacy. Entry pricing runs
  from about $49/month (Bright Data's unlocker nearer $499/month) for a family-scale app that
  might add a few dozen items a month. It would also disclose every pasted product URL to a third
  party, which cuts against [ADR-0004](0004-store-images.md)'s reason for storing images locally.
  Probing a funded commercial competitor showed it *not* using one either — it fetches from a
  datacenter IP with a spoofed browser UA, and replaying that fingerprint against a walled
  retailer returns the challenge, so it cannot preview these sites at all.
- **A per-hostname UA map**, honest by default and WhatsApp-compatible only where required.
  Rejected as more machinery than it earns: it is a list to keep current, and measurement showed
  the single UA causes no regression anywhere (see below), so the map would add maintenance
  without changing outcomes.

## Decision

`OG_USER_AGENT` defaults to:

```
WhatsApp/2.0 (+https://github.com/SantiagoVargasVe/wishlist)
```

The `WhatsApp/` prefix is what the edge allowlist matches on; the appended URL is what makes this
something other than bare impersonation. A site operator reading their logs sees precisely what
this is and can identify or block it specifically, which a copied-verbatim WhatsApp UA would deny
them. Verified to pass everywhere the bare string does.

It stays a single environment variable, so any operator who is uncomfortable with this can set
`OG_USER_AGENT=WishlistBot/1.0` and get the honest-but-blocked behaviour back without a code
change. That reversibility is part of the decision, not an afterthought.

## Consequences

**What this is.** Requests claim to be a WhatsApp-compatible link-preview crawler. That is
substantially true — this is a link-preview crawler, fetching public product pages, at a few
requests a day, honouring the same `robots.txt` rules (product pages are not disallowed), to
render exactly the kind of preview card WhatsApp itself renders. It is also, plainly, leading
with someone else's name to get past a filter, and it very likely contravenes those retailers'
terms of service. Both of those things are true at once and the second is not dissolved by the
first.

This is a judgement that the operator of a personal, self-hosted, family-scale deployment is
entitled to make about their own server. **It is not a recommendation to anyone running this at
scale, commercially, or on behalf of others** — volume is what turns this from an unremarkable
link preview into something a retailer would rightly object to.

**Accepted risks:**

- A retailer may extend its filter and break this again. The failure mode is the pre-existing
  one — no image, manual entry still available — so it degrades to today's behaviour, not worse.
- It does not fix everything. H&M and Uniqlo refuse every UA. T086's manual image path remains
  the universal answer and is not made redundant by this.
- Amazon and MercadoLibre are unaffected: responses were **byte-identical** under both UAs, with
  T035's `data-a-dynamic-image` hook intact. This does not disturb the vendor extractors.

**Revisit if** the app stops being a single-family deployment, request volume grows beyond a
handful a day, or a retailer makes contact — any of which changes the reasoning above rather than
merely inconveniencing it.
