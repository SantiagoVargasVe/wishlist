---
id: T111
title: Sync the compose file from the repo on each deploy tick
epic: E7-deploy
status: done
depends_on: []
size: S
---

## Context

[ADR-0007](../../docs/adr/0007-deploy-via-ghcr-and-pull-timer.md)'s timer keeps the **image**
current: it pulls whatever CI published and applies it. The compose file is not covered. It is
copied into place by hand at setup time and nothing updates it afterwards, so every change to
`infra/docker-compose.prod.yml` is a change to a template the running deployment never sees.

The gap is silent, which is what makes it expensive.
[T110](T110-mail-env-in-prod-compose.md) added five `MAIL_*` variables to the service's
`environment:` block; with no sync step the container keeps starting without them, the app
reports outbound mail as unconfigured, and nothing anywhere explains why. The same is true of
any future variable, volume, or healthcheck.

The mechanism that closes it also widens what a commit to `main` can do — from "replace the
application" to "reconfigure the deployment". The guards below are therefore the substance of
this task rather than defensive decoration.

## Acceptance criteria

- [ ] The deploy unit fetches `infra/docker-compose.prod.yml` over HTTPS before pulling the
      image, and writes it to the file the stack actually runs from
- [ ] The URL is a single `Environment=` line, so a fork changes one line instead of editing a
      command
- [ ] **A failed or partial fetch never replaces a working file.** Download under a temporary
      name and swap only once it is non-empty *and* `docker compose config -q` parses it;
      otherwise discard it and leave what is already there
- [ ] **A fetch failure does not block that tick's image deploy.** The registry being reachable
      while the source host is not is an ordinary outcome, and the image is the half that
      carries security fixes
- [ ] No credentials are involved and none are introduced. The file is public; `.env` is
      explicitly **not** synced and stays hand-managed wherever the stack runs
- [ ] The unit's existing comment is corrected. `up -d` also recreates the container when the
      *resolved configuration* changes, not only when the image moves — verified, and it is what
      makes an edited variable take effect on the next tick. The comment currently understates
      the mechanism the whole feature depends on
- [ ] `infra/deploy/README.md` covers the one-time reinstall this needs to take effect, and the
      fact that a local edit to the compose file is now reverted on the next tick
- [ ] The documented rollback (pin the image to a `sha-` tag) is re-checked against that: it
      edits the very file this now overwrites, so the instruction to stop the timer first stops
      being a nicety and becomes required
- [ ] ADR-0007 records that the timer's scope now includes the compose file

## Out of scope

Syncing `.env` — it holds secrets and must never be fetched from anywhere. Automating the
installation of the unit itself: it changes rarely, and it is the layer that bootstraps
everything else. The timer interval, the image tag scheme, and anything about how the image is
built.

## Files likely touched

```
infra/deploy/wishlist-deploy.service
infra/deploy/README.md
docs/adr/0007-deploy-via-ghcr-and-pull-timer.md
```
