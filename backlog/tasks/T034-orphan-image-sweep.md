---
id: T034
title: Weekly orphan image sweep
epic: E4-og
status: done
depends_on: [T033]
size: S
---

## Context

T033 downloads and stores a copy of every item's image. Soft-deleting an item (or the "removing
an item's last list membership soft-deletes it" path, T024) never touches `data/images/` — the
row's `image_path` and the file on disk both survive, quietly, forever. [ADR-0004](../../docs/adr/0004-store-images.md)
calls this out directly: "Orphaned files need a **weekly local sweep** — no outbound requests, not
a scraper. This is the cron idea redirected to a job it can actually do."

## Design decisions (no prior spec existed)

**Runs inside the app process, scheduled from `instrumentation.ts`** — not a host-level systemd
timer like the deploy poller (`infra/deploy/`), and not a new HTTP endpoint the timer could curl.
Both alternatives were considered and rejected for concrete reasons:

- **A new endpoint** (`POST /api/internal/sweep`, curled by a timer) means a route reachable from
  the public internet the moment the Cloudflare Tunnel maps this host — unlike the deploy timer,
  which only ever runs `docker compose` on the host itself and never touches the app's own HTTP
  surface. Authenticating a purely-internal, no-user-behind-it endpoint is exactly the kind of
  extra attack surface `architecture.md`'s dependency policy asks to justify before adding.
- **A host-side script**, mirroring `wishlist-deploy.service`, doesn't fit this deploy model: the
  production image is Next's `standalone` output, which bundles only what boots the server itself
  (`server.js` plus whatever `instrumentation.ts` imports, the same mechanism that already gets
  `migrate.ts` into the image). There's no general script runner or TypeScript toolchain in that
  image to `docker compose exec` into.
- **`instrumentation.ts`** already is code the standalone build includes and runs once at server
  start, in production only — the exact same reasoning that already puts migrations there. The
  sweep is a natural third job alongside "validate env" and "migrate."

**A wall-clock marker file, not a naive `setInterval` since boot.** `architecture.md` § Operational
notes: "Uptime is best-effort" — the deploy timer alone can restart this container every few
minutes if a new image just landed. An interval timed from process start would either almost never
accumulate a full week of continuous uptime, or fire on an unpredictable cadence entirely
dependent on restart history. Instead, `data/images/.last-sweep`'s mtime is checked against the
current time on every boot and once a day thereafter (`setInterval`) — if it's missing or ≥7 days
old, the sweep runs and the marker is touched. This survives restarts correctly because the
schedule lives on disk, not in the process.

**No new config knob for the interval.** "Weekly" is ADR-0004's own fixed decision, not something
an operator is expected to tune — same reasoning `MAX_REDIRECTS` in `safe-fetch.ts` is a local
constant, not a config var.

**Fired unawaited from `instrumentation.ts`**, same as `downloadItemImage()` — a slow sweep must
never delay the server becoming ready to serve requests.

## Acceptance criteria

- [x] `sweepOrphanImages()` in `src/server/og/sweep.ts`: lists `*.webp` files in
      `config.IMAGE_STORAGE_PATH`, compares against every **live** item's `image_path`, and
      deletes any file not referenced by a live item — this covers both "item soft-deleted, file
      left behind" and "a download's DB write failed after the file was already written"
- [x] Non-`.webp` files (notably the sweep's own marker) are never touched
- [x] One file's delete failing doesn't abort the sweep for the rest
- [x] Scheduled from `instrumentation.ts`, production-only (same gate as migrations), via a
      wall-clock marker file — not a bare `setInterval` timed from process boot
- [x] Tests: removes a file with no matching item, removes a file belonging to a soft-deleted
      item, keeps a file belonging to a live item, ignores non-webp files, the marker-based
      gating (runs when absent/stale, skips when recent, updates after running)

## Bug found via live verification

`next build` (CI's actual gate) accepted `sweep.ts`'s `node:fs/promises` import from
`instrumentation.ts` without complaint, but `next dev` failed outright at startup with
`UnhandledSchemeError: node:fs/promises` — the same edge/client-bundling problem `migrate.ts`
already has a documented workaround for in `next.config.ts`, but build alone didn't reproduce it,
only starting the real dev server did. Fixed by extending the existing webpack alias to also stub
`src/server/og/sweep` for non-nodejs runtimes.

## Out of scope

Backfilling or repairing anything — this only deletes, it never re-downloads. Making the interval
configurable. A manual "sweep now" trigger (an operator can just delete the marker file and
restart, or wait for the next daily check).

## Files likely touched

```
src/server/og/sweep.ts
src/server/og/sweep.test.ts
src/instrumentation.ts
```
