# Multi-stage build producing a standalone Next server.
#
# Built by CI on GitHub's amd64 runners, not locally — the dev machine is arm64
# and cross-building under emulation is slow (ADR-0007). Build context is the
# repo root: `docker build -f infra/Dockerfile .`

# ---- dependencies -----------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Config validation is lazy, so no secrets are needed to build. If this ever
# fails on a missing variable, something started reading config at import time —
# fix that rather than adding placeholder values here.
RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Never run as root. The image writes nothing except through the mounted
# images volume, which the compose file owns.
RUN addgroup -g 1001 -S nodejs \
 && adduser -S -u 1001 -G nodejs nextjs

# `standalone` already contains a minimal node_modules with only what Next
# traced — including drizzle-orm and postgres, reached via instrumentation.ts.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Item images live on a mounted volume; create the mountpoint with correct
# ownership so the non-root user can write to it.
RUN mkdir -p /app/data/images && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000

# An HTTP probe detects a failed instrumentation hook; a live Node process or
# listening TCP port alone is not readiness. Docker reports unhealthy but does
# not restart on health status: fatal initialization explicitly exits instead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=130s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/login',r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1)).setTimeout(4000,function(){this.destroy();process.exit(1)})"

# Migrations run at startup from instrumentation.ts, so there is no separate
# migrate step in the deploy.
CMD ["node", "server.js"]
