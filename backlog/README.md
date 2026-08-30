# Backlog

One markdown file per task in [tasks/](tasks/). Each is written to be picked up **cold** — by a
person or an agent — without reading this conversation or any other task.

## Task format

Frontmatter plus four sections. See [_template.md](_template.md).

```yaml
---
id: T0NN
title: Item CRUD endpoints with soft delete
epic: E3-core-domain
status: todo          # todo | in-progress | blocked | done
depends_on: [T020]
size: M               # S (<2h) | M (half day) | L (multi-day)
---
```

Body: **Context** (why, and what to read) · **Acceptance criteria** (checkable) ·
**Out of scope** (what not to touch) · **Files likely touched**.

A task is well-written if you can paste it into a fresh agent session with no other context and
get something reviewable back. If it needs "as we discussed," it's not done being written.

## Lifecycle

1. Pick a `todo` task whose `depends_on` are all `done`
2. **Branch off `main`**: `feat/T023-item-soft-delete`
3. Set `status: in-progress`
4. Build it. Read only the docs the task's Context names.
5. **Write the tests in the same commit** — see [testing.md](../docs/context/testing.md)
6. Set `status: done` **in the same commit as the code**, so status never drifts from reality
7. Reference the id in the commit: `feat(items): add soft delete [T023]`
8. **Open a PR.** Never push to `main` directly — Santiago reviews and merges.

A task is done when CI is green on the PR, not when it works locally.

Run `npm run test:ci` before opening one — it mirrors CI exactly, **including
coverage thresholds**, which a plain `npm test` does not check.

### Branch naming

`<type>/<task-id>-<short-slug>` — `feat/T023-item-soft-delete`, `fix/T040-claim-race`,
`chore/T002-local-postgres`. One task per branch, one PR per task. If a task turns out to need
splitting, write the second task file and open a second PR rather than growing the first.

### PR description

State the task id, what changed, and how you verified it. If you deviated from the task's
acceptance criteria, say so explicitly and why — that's the part a reviewer can't reconstruct.

If you discover work outside the task's scope, write a new task file rather than widening the
current one. Scope creep inside a task is how tasks stop being self-contained.

## Epics

| Epic | What | Tasks |
|---|---|---|
| **E1** foundation | Next.js app, Docker, Drizzle, Base UI + data layer | T001–T004 |
| **E2** auth | Invite codes, register/login, JWT cookie, auth pages | T010–T014 |
| **E3** core-domain | Wishlist + item schema, CRUD, aggregate read | T020–T025 |
| **E4** og | SSRF-safe fetch, parser, preview endpoint, image pipeline | T030–T036 |
| **E5** claims | Claim schema, endpoints, tokens, rate limits, owner filtering | T040–T043 |
| **E6** frontend | Shell, list page, modals, filters, share CTA, OG metadata | T050–T058 |
| **E7** deploy | Dockerfile, CI image build, pull-timer deploy, WAF rules | T060–T064 |
| **E8** invites | Self-service invite minting | T070 |
| **E9** post-mvp-ui | Card layout, image-after-add race, form UX gating, price masking, multi-select lists | T080–T084 |
| **E10** preview-reliability | Why pasted links so often yield no image, and what to do about it | T085–T088 |
| **E11** post-deploy-ui-polish | Second round of deployed-app UI fixes from real usage (2026-08-30) | T089–T096 |

## Task index

**E1 — Foundation**
- `T001` Initialize Next.js 15 + TypeScript + Tailwind + Vitest — **done**
- `T002` Local Postgres + validated environment config — **done**
- `T003` Drizzle wiring, migration pipeline, real-Postgres test harness — **done**
- `T004` Base UI primitives, dark mode, TanStack Query base client — **done**

**E2 — Auth**
- `T010` Schema: `users`, `invite_codes` + `seed:invite` script — **done**
- `T011` `POST /api/auth/register` with transactional invite consumption — **done**
- `T012` Login / logout / me, JWT signing, httpOnly cookie — **done**
- `T013` Session helper + ownership guards in services — **done** (folded into T022, its first real consumer)
- `T014` `/login` and `/register` pages — **done**

**E3 — Core domain**
- `T020` Schema: `wishlists`, `items`, `wishlist_items` — **done**
- `T021` Default wishlist on registration + partial unique index (extends T011's transaction) — **done**
- `T022` Wishlist CRUD (default-list protection, orphan-item confirmation) — **done**
- `T023` Item CRUD with soft delete — **done**
- `T024` Add/remove item to/from list, last-list removal rule — **done**
- `T025` `GET /api/me` aggregate endpoint — **done**

**E4 — OG enrichment**
- `T030` `safe-fetch` SSRF guard + exhaustive tests — **done**
- `T031` OG / Twitter / JSON-LD parser with precedence + sanitization — **done**
- `T032` `POST /api/preview` + `og_cache` — **done**
- `T033` Image download → sharp → `data/images/` + `/media/:filename` — **done**
- `T034` Weekly orphan image sweep — **done**
- `T035` Vendor-specific image extraction (Amazon) — **done**
- `T036` MercadoLibre catalog-product data via their official API (`.../p/MCO...` links only —
  individual listing links stay unresolved, `GET /items/:id` is blocked for app-level tokens,
  confirmed live) — **done**

**E5 — Claims**
- `T040` Schema + claim/unclaim endpoints, unique constraint, 409 on race — **done**
- `T041` Claim tokens in localStorage + undo UI — **done**
- `T042` Token-bucket rate limiting — **done** (applied to login/register; preview and claim adopt it in T032/T040)
- `T043` `hide_claims_from_owner` server-side stripping

**E6 — Frontend**
- `T050` App shell, layout, i18n scaffolding (Spanish-first) — **done**
- `T051` `/w/[slug]` owner view — **done**
- `T052` `/w/[slug]` visitor view — **done**
- `T053` Add-item modal with live OG preview — **done**
- `T054` Edit + delete item flows (remove-vs-delete distinction) — **done**
- `T055` Create / rename / delete wishlist — **done**
- `T056` Wishlist filter (which list to show — no price filter, see ADR-0009) — **done**
- `T057` Share CTA — **done**
- `T058` `generateMetadata()` OG tags on the share page — **done**

**E7 — Deploy**
- `T060` Add the app hostname to the Cloudflare Tunnel — **done** (manual, Cloudflare dashboard)
- `T061` `infra/Dockerfile` (multi-stage, Next standalone output) — **done**
- `T062` GitHub Actions: build `linux/amd64` image after CI → GHCR — **done**
- `T063` Host: compose pinned to the GHCR image + systemd pull timer — **done**
- `T064` Cloudflare WAF rate-limit rules — **won't do**: turned out to be a paid-plan feature.
  The Postgres token-bucket limiter is the sole line of defense; see
  [security.md](../docs/context/security.md)'s "Known accepted risks"

T061–T063 implement [ADR-0007](../docs/adr/0007-deploy-via-ghcr-and-pull-timer.md) and are
blocked on T001 — there's no application to build an image from yet.

**E8 — Invites**
- `T070` Self-service invite minting — any logged-in user can mint their own invite code,
  per [ADR-0002](../docs/adr/0002-invite-only-registration.md)'s own "owner-facing UI is a later
  nice-to-have" — **done**

**E9 — Post-MVP UI polish**

Real usage of the deployed app (2026-08-25) surfaced these — not part of the original design,
found by actually using it.

- `T080` Item card: fixed height, contained (not cropped) images, visible currency code
- `T081` Fix: a newly-added item's image doesn't appear until the page is reloaded
- `T082` Add-item form: gate other fields behind a valid URL, gate Save behind form validity
- `T083` Price input: thousands-separator masking while typing
- `T084` Wishlist multi-select: replace the checkbox list with a Base UI combobox

Five tasks are fully written as worked examples — the highest-risk and most-referenced ones.
The rest are one-liners here; expand them into files as you pick them up, following the pattern.

**E10 — Preview reliability**

Real usage showed most pasted links produce no image — the one field that can't be typed by
hand. Investigated 2026-08-25; the causes turned out to be three unrelated things, not one.

- `T085` Parse schema.org `ProductGroup`, not just `Product` — recovers prices we already have
  in the HTML and silently drop
- `T086` Let the user supply an image — paste a URL or upload a file — when the scrape finds
  none. The only fix that works on *every* site, including ones we can't fetch at all
- `T087` Send a link-preview `User-Agent` so walled retailers respond — **done**, see
  [ADR-0010](../docs/adr/0010-preview-user-agent.md)
- `T088` Stop treating a bot-wall or error page as a successful scrape — found in production,
  where a retailer's 403 page sat in `og_cache` as `ok` with `title: "Access Denied"`

**The bot wall — resolved by T087, but read this before touching it.** Several retailers serve
their real HTML only to a narrow allowlist of link-preview crawlers, decided purely on
`User-Agent` at the CDN edge, before the request reaches their origin:

| What we send | What comes back |
|---|---|
| `WishlistBot/1.0` | `403 Access Denied`, ~450 bytes |
| a browser UA, or none | `200` — but a JS bot-manager challenge page, not the product |
| `WhatsApp/…` | `200`, the full page, `og:image` present |

Measured across Zara, Bershka, Pull&Bear, Stradivarius, Massimo Dutti and Éxito — all identical.
`facebookexternalhit`, `Twitterbot`, `Slackbot`, `Discordbot`, `TelegramBot`, `LinkedInBot` and
`Applebot` are all refused too, so there is **no honest self-identifying User-Agent that works**.
H&M and Uniqlo refuse every UA including WhatsApp's, and Adidas returns a stub to all of them.
Amazon, MercadoLibre, Falabella, Shein and Nike are unaffected either way.

Two things follow, and both still matter:

- The middle row is a trap. A browser-like UA returns HTTP 200 and parses without error, so it
  reads as success while carrying no metadata at all — and `getPreview()` would cache that as
  `ogStatus: "ok"` for `OG_CACHE_TTL_HOURS` (7 days). Never "fix" a bot wall by sending a
  browser UA; it is worse than sending nothing.
- Getting past it means claiming to be someone else's crawler — a judgement call about this
  deployment, not a technical one. T087 made that call for a family-scale self-hosted install
  and [ADR-0010](../docs/adr/0010-preview-user-agent.md) states the tradeoff plainly, including
  why it is **not** a recommendation at scale. `OG_USER_AGENT=WishlistBot/1.0` opts back out.
- T087 does **not** make T086 redundant. H&M and Uniqlo refuse every UA tried, so a manual image
  path stays the only universal answer.

Two things that look like solutions and are not, both checked rather than assumed:

- **TLS fingerprinting is irrelevant here.** A real Chrome-124 TLS fingerprint (via `curl_cffi`)
  still gets the challenge; a WhatsApp UA over plain curl TLS gets the page. Only the
  User-Agent moves the needle. And the challenge is genuine JavaScript, so no HTTP client passes
  it however well disguised — that takes a browser engine.
- **Paid unblocking services aren't the industry's answer at this scale.** Probing a funded
  commercial competitor showed it fetching from a datacenter IP with a spoofed Edge User-Agent —
  no residential proxy, no vendor. Replaying that fingerprint against Zara returns the challenge,
  so it can't preview these sites either. Meanwhile the services themselves start around $49/mo
  (Bright Data's unlocker, ~$499/mo), and Microlink's free tier returns `EPROXYNEEDED` on Zara
  specifically. Routing every pasted URL through a third party would also tell that vendor what
  the family is buying — against the grain of
  [ADR-0004](../docs/adr/0004-store-images.md)'s reason for storing images locally.

**E11 — Post-deploy UI polish, round 2**

A second batch of small UI fixes from actually using the deployed app (2026-08-30), after the
E9 round. All frontend, all small.

- `T089` Owner item card: `object-cover` images, matching the visitor card (reverses T080's
  `object-contain` for the owner card, deliberately)
- `T090` Owner card actions: two-row layout (Editar / Eliminar full width), hide "Quitar" for
  items that are only in one list — frontend-only, the grid already knows the membership count
- `T091` Add-item form: drop the now-redundant preview card (T086's image picker already shows
  the scraped image) to remove the vertical scroll
- `T092` Item add/edit form: Spanish validation messages (keys in code), fix the stale
  price/currency pairing error, gate Save on real form validity
- `T093` Pointer cursor on interactive controls — Tailwind v4 Preflight dropped the default
- `T094` Fix: after creating a list, the previous list is missing its nav chips until reload
  (stale Next Router Cache — the create flow doesn't `router.refresh()`)
- `T095` Guest view: a "log in" entry in the header — anonymous visitors currently can't tell
  the site has accounts
- `T096` Visitor "Marcar como comprado" button: vertical padding + ≥44px touch target
