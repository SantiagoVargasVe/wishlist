/**
 * Next runs `register()` once when the server starts.
 *
 * Two jobs, both of which have to happen at boot rather than at build:
 *
 * 1. Validate the environment. Config is lazy so `next build` needs no secrets
 *    (see config.schema.ts), but a running server with a broken environment
 *    should die immediately rather than serve requests until something reads a
 *    missing variable.
 *
 * 2. Apply migrations, in production only. Deploys are unattended — an image
 *    lands in GHCR and a timer pulls it (ADR-0007) — so there is nowhere to run
 *    a manual migration step. In development you run `npm run db:migrate`
 *    yourself, so a boot-time migration would just be a surprise.
 */
export async function register() {
  // Edge runtime has no process.env worth validating, and postgres is Node-only.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getConfig } = await import("./server/config");
  const config = getConfig();

  if (config.NODE_ENV === "production") {
    const { runMigrations } = await import("./server/db/migrate");
    await runMigrations();
  }
}
