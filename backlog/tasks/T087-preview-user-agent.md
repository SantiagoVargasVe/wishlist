---
id: T087
title: Send a link-preview User-Agent so walled retailers return their HTML
epic: E10-preview-reliability
status: done
depends_on: [T030, T032]
size: S
---

## Context

Pasted links from several large retailers produced no image, because the HTML never arrived: their
CDNs decide on `User-Agent` at the edge, before the request reaches origin. `WishlistBot/1.0`
gets a 403; a browser-shaped UA gets an unsolvable JavaScript challenge that still returns
HTTP 200; only a `WhatsApp/`-prefixed UA gets the page.

Full measurements, alternatives, and the honesty tradeoff are in
[ADR-0010](../../docs/adr/0010-preview-user-agent.md). Read it before changing this — the
reasoning matters more than the string.

## Acceptance criteria

- [x] `OG_USER_AGENT`'s default identifies as a WhatsApp-compatible link-preview crawler **and**
      carries a URL identifying this project, so an operator reading their logs can tell what it
      is — verified to pass everywhere the bare WhatsApp string does
- [x] `safe-fetch`'s `DEFAULT_USER_AGENT` is kept in sync, so a caller that omits the option
      doesn't silently get a blocked UA
- [x] Setting `OG_USER_AGENT=WishlistBot/1.0` restores the previous behaviour with no code change
- [x] `.env.example` explains the tradeoff and names the opt-out, rather than just carrying a
      new value
- [x] A test asserts the fallback UA, so a future edit can't silently reintroduce a blocked one
- [x] No regression for vendors that already worked

## Verification

Measured live across 14 retailers, classifying the **response body** rather than the status code
— which is essential here, since the browser-UA case returns HTTP 200 with a challenge page and
would otherwise score as a pass.

Usable HTML returned: **5 of 14** before, **12 of 14** after.

| Newly working | Already working, unchanged | Still blocked |
|---|---|---|
| Zara, Bershka, Pull&Bear, Stradivarius, Massimo Dutti, Éxito | Amazon, MercadoLibre, Falabella, Shein, Nike | H&M, Uniqlo (refuse every UA tried) |

Regression checks:

- **Amazon responses were byte-identical** under both UAs (661,097 and 1,248,061 bytes on two
  products), with T035's `data-a-dynamic-image` hook present in both. The vendor extractor is
  untouched.
- A real Zara product page fetched with the new UA parses to title, description and image
  through the existing parser. Its price still needs [T085](T085-jsonld-productgroup.md) —
  unrelated to this change.
- Notably a **browser** UA would have been a regression: Amazon returned an empty body for it.

## Out of scope

- Per-hostname UA overrides — considered and rejected in ADR-0010 as maintenance without benefit,
  since the single UA regressed nothing.
- Headless-browser rendering, and commercial unblocking services. Both evaluated in the ADR.
- The manual image fallback ([T086](T086-manual-image-fallback.md)), which stays the answer for
  H&M, Uniqlo, and anything else that refuses every UA. This change does not make it redundant.
- Cache-quality gating. A metadata-less scrape is still cached as `ogStatus: "ok"`; worth its own
  task, and unchanged by this.

## Files likely touched

```
docs/adr/0010-preview-user-agent.md
src/server/config.schema.ts
src/server/net/safe-fetch.ts
src/server/net/safe-fetch.test.ts
.env.example
```
