# Deploy

Implements [ADR-0007](../../docs/adr/0007-deploy-via-ghcr-and-pull-timer.md): CI builds an
amd64 image and pushes it to GHCR; the host polls and applies it. The host never
builds, exposes no inbound port, and holds no GitHub credentials while the
package is public.

## Host layout

```
<deploy-dir>/
  docker-compose.yml     # fetched from this repo by the timer
  .env                   # chmod 600, never in git
  data/
    images/
    postgres/
```

`<deploy-dir>` is wherever you put it — the unit points at it and nothing else cares.

## First-time setup

```bash
mkdir -p <deploy-dir>/data/{images,postgres}
cd <deploy-dir>
# copy docker-compose.prod.yml here as docker-compose.yml, then write .env
chmod 600 .env
docker compose up -d
```

Then install the timer. **Edit `WorkingDirectory`, `User` and `Group` in the unit first** — they
ship as placeholders, because a real path and account name would describe somebody's machine
rather than the software:

```bash
sudo cp wishlist-deploy.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now wishlist-deploy.timer
```

After the first install the compose file keeps itself current, so this is a one-time step —
see "Updating the unit" below for the exception.

## Updating the unit

The unit fetches `infra/docker-compose.prod.yml` from the repository on every tick, so a compose
change ships like any other change. **The unit itself does not** — it is the layer that
bootstraps the rest, so a change to this file needs one manual install:

```bash
sudo cp wishlist-deploy.service /etc/systemd/system/
sudo systemctl daemon-reload
```

Two consequences of the compose file being synced, both deliberate:

- **A local edit to `docker-compose.yml` is reverted on the next tick.** The repository is the
  source of truth for it now. Anything that must differ per-deployment belongs in `.env`, which
  is never fetched.
- **`.env` stays hand-managed.** It holds secrets and is not in git. Editing it is enough on its
  own, though: `up -d` recreates the container when the resolved configuration changes, so the
  next tick applies it without any further action.

## Operating it

```bash
systemctl list-timers wishlist-deploy.timer   # when it next fires
journalctl -u wishlist-deploy.service -n 50   # what it did last
systemctl start wishlist-deploy.service       # deploy right now
```

## Rollback

Images are tagged `latest` and `sha-<commit>`. To pin a known-good build, edit
`docker-compose.yml` to that sha tag and `docker compose up -d`.

**Stop the timer first.** This was already necessary — the timer pulls `latest` back over the
pin — and it is now doubly so: the tick also overwrites `docker-compose.yml` itself with the
repository's copy, so an un-stopped timer erases the pin rather than merely outrunning it.

```bash
sudo systemctl stop wishlist-deploy.timer
```

For a rollback meant to outlive the incident, pin the tag in the repository instead and let the
sync carry it — that is the only form of pin the timer will respect.

## Why a timer and not a webhook or a runner

A webhook means another public endpoint and another shared secret. A self-hosted
GitHub Actions runner is worse: on a public repository anyone who opens a pull
request can execute code on it, and this one would sit inside a home LAN. Polling
costs one registry request every five minutes and needs no inbound anything.
