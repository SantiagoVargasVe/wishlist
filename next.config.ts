import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the production image small — see ADR-0007.
  output: "standalone",

  // Native module — cannot be bundled, must be required at runtime.
  serverExternalPackages: ["@node-rs/argon2"],

  // Migrations run at boot from instrumentation.ts, so the SQL files have to be
  // in the image. Next only traces code it can follow through imports; raw .sql
  // read at runtime is invisible to it and must be included explicitly.
  outputFileTracingIncludes: {
    "/": ["./src/server/db/migrations/**/*"],
  },
};

export default nextConfig;
