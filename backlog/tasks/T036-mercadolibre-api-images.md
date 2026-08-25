---
id: T036
title: MercadoLibre product data via their official API
epic: E4-og
status: done
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

### URL → item ID is not one fixed shape — and only one shape turned out to be reachable

Two different MercadoLibre permalink shapes exist, hitting two different API resources:

- **Catalog/product permalinks** — `.../p/MCO43708014` (confirmed live, T035's own test URL) — the
  id after `/p/` is a *catalog product* id, resolved via `GET /products/:id`.
- **Individual listing permalinks** — typically `articulo.mercadolibre.<tld>/MCO-123456789-...`
  (item id with a hyphen after the site prefix) — would be resolved via `GET /items/:id`.

**Confirmed live, with real registered credentials, before writing any code:** `GET /items/:id`
returns `403 access_denied` for a `client_credentials` app-level token — tested against several
real, currently-live items (one discovered seconds earlier through `/products/:id/items`, ruling
out "stale id" as the explanation). This is a hard wall, not a fluke: individual-listing lookups
require the item's own seller to grant a real, logged-in `Authorization Code` consent — an
app-level credential alone cannot reach them. `GET /products/:id` and `GET
/products/:id/items` (which carries the actual price, confirmed against a real iPhone 15 listing
at `4,650,000 COP`) **do** work with the app-level token.

Santiago chose (see below) to ship the catalog-only version rather than pursue Authorization Code
for the individual-listing case.

## Design decisions

**Catalog-product URLs only — individual listing links are a documented gap, not silently
dropped.** Given the confirmed `403 access_denied` wall on `GET /items/:id` above, pursuing
Authorization Code (a one-time manual consent as the app owner, a long-lived refresh token to
store and rotate) was weighed against shipping the smaller, already-working slice now. Santiago
chose the smaller slice: mainstream catalog-enrolled products (phones, appliances, branded goods —
generally what `/p/MCO...` links point to) resolve; individual/niche listings
(`articulo.mercadolibre.<tld>/MCO-...`) keep falling through to the generic scrape, which fails
for them exactly as it did before this task — not a regression, a real but partial win.

**A parallel data source, not a `parser.ts` fallback.** T035's vendor registry fills in one field
(`imageUrl`) when the generic HTML parse already ran and came up short. MercadoLibre needs the
opposite shape: skip the HTML fetch and generic parse entirely for a recognized catalog URL, and
build the `PreviewResult` (title, imageUrl, price, currency) straight from their API's JSON. The
seam is `scrape()` in `src/server/og/preview.ts`: `resolveMercadoLibrePreview()` runs first; a
`null` return (not a catalog URL, or credentials unset) falls through to the existing `safeFetch` +
`parseProductMetadata` path unchanged. Once it recognizes a catalog URL, though, it **always**
returns a full result (`ogStatus: "ok"` or `"failed"`) rather than falling through on a partial
failure — a generic `safeFetch` retry of a `mercadolibre.*` URL is known (T035) to be doomed by the
`/gz/account-verification` wall, so falling through would just waste a timeout. `og_cache` and the
rest of the pipeline (T033's image download, the add-item form's prefill) don't need to know or
care which source produced the `PreviewResult`.

**Config, not a secret hardcoded anywhere.** `MELI_CLIENT_ID` / `MELI_CLIENT_SECRET` belong in
`config.schema.ts` like every other credential — **optional**, not required at boot. Not every
self-hosted deployment will register a MercadoLibre app; when unset, MercadoLibre links simply
fall through to the existing generic scrape.

**Deviation: plain `fetch()`, not `safeFetch`.** The original plan called for routing MercadoLibre
API calls through `safeFetch` anyway, for consistency. Building it revealed that doesn't actually
fit: `safeFetch`'s `defaultTransport` only issues `GET`-shaped requests with two fixed headers
(User-Agent, Accept-Encoding) — it has no support for a `POST` body or an `Authorization` header,
both required for the OAuth token exchange and every authenticated API call here. Extending
`safeFetch`'s contract to accept arbitrary methods/headers/bodies would blur its actual job — a
narrowly-scoped guard for *user-supplied* URLs — just to reuse it for calls to a fixed, trusted
host (`api.mercadolibre.com`) that was never the risk `safeFetch` exists to guard against (no
DNS-rebinding/private-IP concern applies to a hardcoded hostname). Plain `fetch()` is what this
codebase already uses for genuinely trusted, fixed-host calls elsewhere; `security.md`'s "every
outbound fetch" is about fetching what a user pasted, not about calling this app's own configured
third-party API. The real injection surface here — the catalog-product id extracted from the
pasted URL — is still validated against a strict pattern before it's interpolated into the API
path.

**Access token caching via a factory closure, not a module-level singleton with a test-reset
escape hatch.** `createMeliTokenProvider()` returns a closure holding its own cache; the app uses
one shared instance (`getMeliAccessToken`), while tests construct their own isolated instances.
`client_credentials` tokens are reusable for their full lifetime (confirmed live: `expires_in:
21600`, 6 hours) — refreshed proactively a minute before expiry, never fetched per preview.

**Price comes from `GET /products/:id/items`, not `buy_box_winner` on the product itself.**
`buy_box_winner` on `/products/:id` was `null` on every real product tried during live
verification — it only appears to populate for products with one clearly-dominant, high-confidence
offer. `/products/:id/items` reliably returned the real competing listings (confirmed against a
real iPhone 15 at `4,650,000 COP`) even when `buy_box_winner` was null, and its first result is
MercadoLibre's own ranking of those offers — not necessarily the cheapest, but the same signal a
visitor sees first on the real page. When no listings exist at all (`404 "No winners found"`,
confirmed live for two real but currently-unsold catalog entries), price/currency resolve to
`null` — title and image still resolve fine, `ogStatus` stays `"ok"`, matching the "every field is
independently optional" contract the rest of the parser already holds to. The same
`SUPPORTED_CURRENCIES` (COP/USD) filter `preview.ts`'s generic path already applied is reused here
via a small shared module, rather than duplicated or silently skipped for this path.

## Acceptance criteria

- [x] `MELI_CLIENT_ID` / `MELI_CLIENT_SECRET` added to `config.schema.ts` as optional
- [x] A token-management module (`vendors/mercadolibre/token.ts`): fetches an app-level access
      token via `client_credentials`, caches it, refreshes before expiry — never fetches a fresh
      token per preview request
- [x] Hostname detection for `mercadolibre.<tld>` and `mercadolivre.com.br` (Brazil's spelling)
- [x] Catalog-product id extraction from `.../p/MCO...`-style permalinks only (see the scope
      decision above) — a non-matching path resolves to `null`, never interpolated unchecked into
      the API URL
- [x] Resolves via `GET /products/:id` (title, image) and `GET /products/:id/items` (price,
      currency) and maps the response into `PreviewResult`'s existing shape
- [x] When `MELI_CLIENT_ID`/`MELI_CLIENT_SECRET` are unset, or the URL isn't a recognized catalog
      permalink, MercadoLibre URLs fall through to the existing generic scrape path unchanged
- [x] Never blocks a save (non-negotiable #2) — a failed token exchange, a 404 product lookup, or
      an unrecognized URL all resolve cleanly (`ogStatus: "failed"` or fall-through to the generic
      path), never a thrown error reaching `getPreview()`
- [x] Tests: catalog-id extraction and hostname matching (including rejection of non-catalog and
      non-MercadoLibre URLs), token caching/refresh/isolation-between-instances, `PreviewResult`
      mapping from realistic API response fixtures (including the no-active-listings and
      unsupported-currency cases), the unset-credentials and non-matching-URL fallthroughs, and
      that a recognized MercadoLibre URL never reaches `safeFetch` once credentials are configured
- [x] Live-verified end to end with real registered credentials: real title, real image, real
      price (`4,650,000 COP`) for a real, currently-listed iPhone 15 catalog page — not just
      mocked-test-passing

## Out of scope

Individual MercadoLibre listing permalinks (`articulo.mercadolibre.<tld>/MCO-...`) — confirmed
live that `GET /items/:id` is walled off from app-level tokens; would need Authorization Code (the
item's own seller granting real login-based consent), a materially bigger task Santiago chose not
to pursue now. These links keep resolving to `ogStatus: "failed"`, same as before this task.

Registering the actual MercadoLibre developer app — that was Santiago's own manual step, done
before implementation started here.

Scraping MercadoLibre's HTML directly, with headers/cookies/session tuned to dodge the
`/gz/account-verification` wall — this app has no interest in maintaining an anti-bot-detection
arms race, this task exists specifically to avoid that path.

## Files touched

```
src/server/config.schema.ts
src/server/og/supported-currencies.ts
src/server/og/vendors/mercadolibre/token.ts
src/server/og/vendors/mercadolibre/token.test.ts
src/server/og/vendors/mercadolibre/resolve.ts
src/server/og/vendors/mercadolibre/resolve.test.ts
src/server/og/preview.ts
src/server/og/preview.test.ts
.env.example
```
