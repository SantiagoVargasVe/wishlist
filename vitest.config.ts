import "dotenv/config";

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

// Integration tests need DATABASE_URL_TEST. Passed through explicitly rather
// than relying on worker env inheritance, which varies by pool type.
const passthroughEnv = {
  DATABASE_URL_TEST: process.env.DATABASE_URL_TEST ?? "",
  CI: process.env.CI ?? "",
};

export default defineConfig({
  test: {
    globals: true,
    // Two environments: server code is plain Node, UI code needs a DOM.
    projects: [
      {
        resolve: { alias },
        test: {
          name: "server",
          environment: "node",
          include: ["src/server/**/*.{test,spec}.ts"],
          env: passthroughEnv,
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "ui",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/{app,lib}/**/*.{test,spec}.{ts,tsx}"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**"],
      exclude: ["src/**/*.{test,spec}.{ts,tsx}", "src/server/db/migrations/**"],
      // No repo-wide gate — it rewards testing getters. Only the two areas
      // where a bug is expensive are enforced. See docs/context/testing.md.
      thresholds: {
        "src/server/net/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/server/services/**": {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
});
