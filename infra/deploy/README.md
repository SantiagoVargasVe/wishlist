# Deploy

Implements [ADR-0007](../../docs/adr/0007-deploy-via-ghcr-and-pull-timer.md): CI builds an
amd64 image and pushes it to GHCR; the host polls and applies it. The host never
builds, exposes no inbound port, and holds no GitHub credentials while the
package is public.

## Host layout

```
~/nas/wishlist/
  docker-compose.yml     # copy of infra/docker-compose.prod.yml
  .env                   # chmod 600, never in git
  data/
    images/
    postgres/
```

## First-time setup

```bash
mkdir -p ~/nas/wishlist/data/{images,postgres}
cd ~/nas/wishlist
# copy docker-compose.prod.yml here as docker-compose.yml, then write .env
chmod 600 .env
docker compose up -d
```

Then install the timer:

```bash
sudo cp wishlist-deploy.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now wishlist-deploy.timer
```

## Operating it

```bash
systemctl list-timers wishlist-deploy.timer   # when it next fires
journalctl -u wishlist-deploy.service -n 50   # what it did last
systemctl start wishlist-deploy.service       # deploy right now
```

## Rollback

Images are tagged `latest` and `sha-<commit>`. To pin a known-good build, edit
`docker-compose.yml` to that sha tag and `docker compose up -d`. **Stop the timer
first** — otherwise it pulls `latest` back over the pin on the next tick:

```bash
sudo systemctl stop wishlist-deploy.timer
```

## Why a timer and not a webhook or a runner

A webhook means another public endpoint and another shared secret. A self-hosted
GitHub Actions runner is worse: on a public repository anyone who opens a pull
request can execute code on it, and this one would sit inside a home LAN. Polling
costs one registry request every five minutes and needs no inbound anything.
