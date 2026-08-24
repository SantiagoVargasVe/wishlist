# ADR-0007 — Deploy via GHCR image and a pull timer, not a runner or webhook

**Status:** Accepted · 2026-08-23 · *Not yet implemented — needs a Dockerfile (T001, T061)*

## Context

The repo is public on GitHub. Development happens on an arm64 Mac; the deployment target is an
amd64 self-hosted box behind a Cloudflare Tunnel with no inbound ports. Deploys should not
require SSHing in and running `git pull` by hand.

## Decision

```
push to main → GitHub-hosted runner builds linux/amd64 image → GHCR
                                                                ↓
   host systemd timer (~5 min) → docker compose pull && up -d
```

The host only ever pulls. It runs no runner, exposes no webhook, and holds no GitHub credentials
if the GHCR package is public.

## Why not the alternatives

**Self-hosted Actions runner — rejected on security grounds.** GitHub warns explicitly against
self-hosted runners on public repositories: anyone who opens a pull request can execute arbitrary
code on the runner. Here that runner would sit inside a home LAN, which is a worse hole than any
this design closes. This is the single most important reason the pipeline looks the way it does.

**Actions connecting over SSH — rejected.** Would mean exposing SSH to the internet so GitHub's
runners could reach it. The whole point of the tunnel is that nothing inbound is open.

**Webhook receiver on the host — rejected.** Workable, but it means another public endpoint,
another shared secret, and more attack surface than a poll.

**Building on the host — rejected.** Native amd64 so no emulation, but it puts build load on a
box already running other memory-hungry containers. Building elsewhere is free and keeps the
host doing one thing.

**Cross-building on the Mac** with `buildx --platform linux/amd64` works but is slow under
emulation, and makes deploys depend on one laptop being awake.

## Consequences

- Deploys are asynchronous: a push takes roughly build time plus up to the poll interval. Fine
  for a hobby project; nothing here needs instant rollout.
- The timer is a plain `docker compose pull && docker compose up -d`. Docker no-ops when the
  image digest is unchanged, so polling costs nothing.
- Rollback is `docker compose` pinned to a previous image tag. Tag images with both `latest` and
  the commit SHA so a specific version is always addressable.
- If the GHCR package is public, the host needs no registry credentials at all. If it's made
  private, a read-only PAT is required on the host.
- **Never add a `pull_request` trigger that builds untrusted code with access to secrets.** Build
  on `push` to `main` only.
