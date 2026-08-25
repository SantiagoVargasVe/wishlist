---
id: T036
title: MercadoLibre product data via their official API
epic: E4-og
status: todo
depends_on: [T032]
size: L
---

## Context

[T035](T035-vendor-image-extractors.md) investigated MercadoLibre live and left it out of
scope: any non-browser client (a real Chrome UA, no cookies, our bot UA) gets `302`'d to
`/gz/account-verification`, a bot-check wall, before any product HTML is ever served. There is no
markup to parse — the approach that fixed Amazon (T035) cannot work here at all.

The only real fix is MercadoLibre's own REST API instead of scraping their HTML. This is a
materially different shape of work from T035: not a fallback bolted onto the existing
`parseProductMetadata` pipeline, but a second data source entirely, and it requires an operator
action outside this codebase before any of it can run.

### What's confirmed about their API (verify again at implementation time — their docs blocked an
automated fetch during research; the operator will see the current, authoritative version when
registering the app)

- Every call, including public read-only ones, now requires an OAuth2 access token in an
  `Authorization: Bearer ...` header — confirmed live in T035's investigation
  (`api.mercadolibre.com/items/{id}` returned `403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES`
  unauthenticated, not the open response older integration guides describe).
- The **`client_credentials` grant** is supported for exactly this case: app-level access with no
  user login, no seller account, no per-visitor consent screen. `POST
  https://api.mercadolibre.com/oauth/token` with `grant_type=client_credentials`, `client_id`,
  `client_secret` → an `access_token` usable against public endpoints like `GET /items/:id`.
  ([Rollout's integration guide](https://rollout.com/integration-guides/mercado-libre/sdk/step-by-step-guide-to-building-a-mercado-libre-api-integration-in-js)
  confirms client_credentials tokens reach `GET /items/{item_id}`; MercadoLibre's own
  authentication docs are the source of truth but returned `403` to an automated fetch during
  research — read them directly at implementation time.)
- `client_id`/`client_secret` come from registering an app at
  `developers.mercadolibre.com.<tld>` — **a manual step Santiago has to do himself**, the same
  shape as `T060` in [the backlog index](../README.md) (add the app hostname to the Cloudflare
  Tunnel, done manually in the dashboard) — nothing here
  can be done by an agent.
- Token lifetime/refresh cadence needs confirming against the real docs response (`expires_in`)
  during implementation, not assumed.

### URL → item ID is not one fixed shape

Two different MercadoLibre permalink shapes need handling, and they hit two different API
resources:

- **Catalog/product permalinks** — `.../p/MCO43708014` (confirmed live, T035's own test URL) — the
  id after `/p/` is a *catalog product* id, resolved via `GET /products/:id`, not `GET /items/:id`.
- **Individual listing permalinks** — typically `.../MCO-123456789-...` (item id with a hyphen
  after the two-letter site prefix) — resolved via `GET /items/:id`.

Confirming which shape a given real URL is and what each endpoint actually returns (title, price,
currency, image) needs doing against the live API during implementation — don't guess the field
names or endpoint choice from memory.

## Design decisions

**A parallel data source, not a `parser.ts` fallback.** T035's vendor registry fills in one field
(`imageUrl`) when the generic HTML parse already ran and came up short. MercadoLibre needs the
opposite shape: skip the HTML fetch and generic parse entirely for `mercadolibre.<tld>` /
`mercadolivre.com.br` hosts, and build the `PreviewResult` (title, imageUrl, price, currency)
straight from their API's JSON. The natural seam is `scrape()` in `src/server/og/preview.ts`:
branch on hostname before calling `safeFetch` + `parseProductMetadata`, same place `getPreview()`
already normalizes and caches by URL — `og_cache` and the rest of the pipeline (T033's image
download, the add-item form's prefill) don't need to know or care which source produced the
`PreviewResult`.

**Config, not a secret hardcoded anywhere.** `MELI_CLIENT_ID` / `MELI_CLIENT_SECRET` belong in
`config.schema.ts` like every other credential — **optional**, not required at boot. Not every
self-hosted deployment will register a MercadoLibre app; when unset, MercadoLibre links simply
fall through to the existing generic scrape (which, per the investigation above, will resolve to
`ogStatus: "failed"` today — no worse than the current behavior, never a hard failure).

**Still goes through `safeFetch`, even though the SSRF class of risk is different.**
`api.mercadolibre.com` is a fixed, trusted host, not user-supplied — the DNS-rebinding/private-IP
concern `safeFetch` exists for doesn't really apply to a hardcoded hostname. Routing through it
anyway is about consistency (timeout, size cap, no-throw-raw-errors contract) matching
[security.md](../../docs/context/security.md)'s literal "no exceptions," not because this specific
call is SSRF-risky. The item/product id extracted from the pasted URL must still be validated
against a strict format (e.g. `^[A-Z]{3}-?\d+$`) before it's interpolated into the API path —
that's the actual injection surface here, not SSRF.

**Access token caching, not a fetch-per-request.** `client_credentials` tokens are reusable until
they expire; fetching a new one on every preview would be wasteful and adds MercadoLibre's own
rate limits as a new failure mode on the hot path. Cache the token in memory with its expiry and
refresh proactively — needs its own small module, not stuffed into `scrape()`.

## Acceptance criteria

- [ ] `MELI_CLIENT_ID` / `MELI_CLIENT_SECRET` added to `config.schema.ts` as optional
- [ ] A token-management module: fetches an app-level access token via `client_credentials`,
      caches it, refreshes before expiry — never fetches a fresh token per preview request
- [ ] Hostname detection for `mercadolibre.<tld>` and `mercadolivre.com.br` (Brazil's spelling)
- [ ] Item/product id extraction from both permalink shapes described above; rejects anything that
      doesn't match the expected id format rather than interpolating it unchecked into a URL
- [ ] Resolves via `GET /items/:id` or `GET /products/:id` (whichever the id shape calls for) and
      maps the response into `PreviewResult`'s existing shape — title, imageUrl, price, currency,
      siteName
- [ ] When `MELI_CLIENT_ID`/`MELI_CLIENT_SECRET` are unset, MercadoLibre URLs fall through to the
      existing generic scrape path unchanged — this feature is additive, never a new hard
      dependency for operators who don't want it
- [ ] Never blocks a save (non-negotiable #2) — an API error, a missing token, or an unrecognized
      URL shape all resolve to the existing `ogStatus: "failed"` contract, exactly like a failed
      generic scrape does today
- [ ] Tests: id extraction for both permalink shapes (and rejection of malformed ones), token
      caching/refresh behavior, `PreviewResult` mapping from a realistic API response fixture, the
      unset-credentials fallthrough, and that a MercadoLibre URL never reaches the generic
      `safeFetch` + `parseProductMetadata` path when credentials *are* configured

## Out of scope

Registering the actual MercadoLibre developer app — that's Santiago's own manual step, like T060.
This task only needs to work once real `MELI_CLIENT_ID`/`MELI_CLIENT_SECRET` values exist in
`.env`.

Any MercadoLibre country beyond what a single `api.mercadolibre.com` + site-id-prefix scheme
covers, if their API turns out to need a different base URL per country — confirm this during
implementation rather than assuming today.

Scraping MercadoLibre's HTML directly, with headers/cookies/session tuned to dodge the
`/gz/account-verification` wall — this app has no interest in maintaining an anti-bot-detection
arms race, this task exists specifically to avoid that path.

## Files likely touched

```
src/server/config.schema.ts
src/server/og/vendors/mercadolibre/token.ts
src/server/og/vendors/mercadolibre/token.test.ts
src/server/og/vendors/mercadolibre/resolve.ts
src/server/og/vendors/mercadolibre/resolve.test.ts
src/server/og/preview.ts
src/server/og/preview.test.ts
.env.example
```
