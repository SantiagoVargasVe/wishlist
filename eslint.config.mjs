import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "next-env.d.ts",
      "src/server/db/migrations/**",
    ],
  },

  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Underscore marks a deliberately unused binding. `ignoreRestSiblings` covers
  // the omit-by-destructuring idiom: `const { secret: _drop, ...rest } = obj`.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // Architectural boundary (ADR-0001): the UI layer never reaches into the
  // database. Route Handlers call services; services own Drizzle.
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "drizzle-orm",
              message:
                "src/app must not touch the DB. Call a service in src/server/services/ instead.",
            },
            {
              name: "postgres",
              message:
                "src/app must not touch the DB. Call a service in src/server/services/ instead.",
            },
          ],
          patterns: [
            {
              group: ["@/server/db", "@/server/db/*", "**/server/db", "**/server/db/*"],
              message:
                "src/app must not import from src/server/db. Go through src/server/services/.",
            },
          ],
        },
      ],
    },
  },

  // Components are <= 100 LOC, one per file (design-system.md). Blank lines and
  // comments don't count — the limit forces composition, not terse code.
  {
    files: ["src/app/**/*.tsx"],
    ignores: ["src/app/**/*.test.tsx", "src/app/**/*.spec.tsx"],
    rules: {
      "max-lines": [
        "error",
        { max: 100, skipBlankLines: true, skipComments: true },
      ],
    },
  },
];

export default config;
