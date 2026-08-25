import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the production image small — see ADR-0007.
  output: "standalone",

  // Native modules — cannot be bundled, must be required at runtime.
  serverExternalPackages: ["@node-rs/argon2", "sharp"],

  // Next prepares an edge-compatible bundle of instrumentation.ts — "Next.js
  // calls register in all environments" per its own docs — and Next dev also
  // runs it through the browser/client compiler pass. Neither target can
  // resolve migrate.ts's dependency chain (drizzle-orm's migrator needs
  // node:crypto; postgres needs net/tls/fs/os/stream/...) even though
  // instrumentation.ts only ever calls it behind a NEXT_RUNTIME === 'nodejs'
  // guard, Next's own documented pattern — that guard prevents *execution*,
  // not webpack's static discovery of the import.
  //
  // Stub it for every target except the real Node.js server, which is the
  // only one that ever executes it. Confirmed both edge and client trip this
  // before landing on the broader condition — a narrower `=== "edge"` check
  // alone was not sufficient.
  //
  // The alias key must be an absolute path. Webpack resolves alias keys
  // relative to the compiler's root context (the project root), not relative
  // to the file doing the importing — the string "./server/db/migrate"
  // written as a key would target <root>/server/db/migrate, not
  // <root>/src/server/db/migrate, and silently never match anything.
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime !== "nodejs") {
      config.resolve.alias[path.resolve(process.cwd(), "src/server/db/migrate")] = false;
    }
    return config;
  },

  // Migrations run at boot from instrumentation.ts, so the SQL files have to be
  // in the image. Next only traces code it can follow through imports; raw .sql
  // read at runtime is invisible to it and must be included explicitly.
  outputFileTracingIncludes: {
    "/": ["./src/server/db/migrations/**/*"],
  },
};

export default nextConfig;
