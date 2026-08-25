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
| **E4** og | SSRF-safe fetch, parser, preview endpoint, image pipeline | T030–T034 |
| **E5** claims | Claim schema, endpoints, tokens, rate limits, owner filtering | T040–T043 |
| **E6** frontend | Shell, list page, modals, filters, share CTA, OG metadata | T050–T058 |
| **E7** deploy | Dockerfile, CI image build, pull-timer deploy, WAF rules | T060–T064 |
| **E8** invites | Self-service invite minting | T070 |

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
- `T060` Add the app hostname to the Cloudflare Tunnel — *manual, Cloudflare dashboard*
- `T061` `infra/Dockerfile` (multi-stage, Next standalone output) — **done**
- `T062` GitHub Actions: build `linux/amd64` image after CI → GHCR — **done**
- `T063` Host: compose pinned to the GHCR image + systemd pull timer — **done**
- `T064` Cloudflare WAF rate-limit rules

T061–T063 implement [ADR-0007](../docs/adr/0007-deploy-via-ghcr-and-pull-timer.md) and are
blocked on T001 — there's no application to build an image from yet.

**E8 — Invites**
- `T070` Self-service invite minting — any logged-in user can mint their own invite code,
  per [ADR-0002](../docs/adr/0002-invite-only-registration.md)'s own "owner-facing UI is a later
  nice-to-have"

Five tasks are fully written as worked examples — the highest-risk and most-referenced ones.
The rest are one-liners here; expand them into files as you pick them up, following the pattern.
