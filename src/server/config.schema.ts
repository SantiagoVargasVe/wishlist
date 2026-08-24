import { z } from "zod";

/**
 * Environment schema and a pure parser.
 *
 * Kept separate from `config.ts` so tests can exercise validation without the
 * `server-only` guard or a populated `process.env`. Nothing here reads the
 * environment or has side effects.
 */

const postgresUrl = z
  .string()
  .min(1)
  .refine(
    (v) => v.startsWith("postgresql://") || v.startsWith("postgres://"),
    "must be a postgresql:// connection string",
  );

export const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: postgresUrl,

  // 32 chars minimum. A short signing secret is worse than a missing one:
  // it looks configured while being trivially brute-forceable.
  AUTH_SECRET: z
    .string()
    .min(32, "must be at least 32 characters (openssl rand -base64 48)"),
  AUTH_COOKIE_NAME: z.string().min(1).default("wishlist_session"),
  AUTH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Public origin. Share links and OG metadata build absolute URLs from this,
  // so a wrong value produces links that resolve nowhere.
  APP_URL: z.url(),

  IMAGE_STORAGE_PATH: z.string().min(1).default("./data/images"),
  IMAGE_MAX_WIDTH: z.coerce.number().int().positive().default(800),
  IMAGE_WEBP_QUALITY: z.coerce.number().int().min(1).max(100).default(80),

  // Snapshot rate for cross-currency filtering only — never displayed.
  // See docs/context/data-model.md § Money.
  FX_COP_PER_USD: z.coerce.number().positive().default(4100),

  OG_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  OG_MAX_HTML_BYTES: z.coerce.number().int().positive().default(2_097_152),
  OG_MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(10_485_760),
  OG_CACHE_TTL_HOURS: z.coerce.number().int().positive().default(168),
  OG_USER_AGENT: z.string().min(1).default("WishlistBot/1.0"),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Validate an environment object, throwing with *every* problem listed rather
 * than only the first — fixing config one error per restart is miserable.
 */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = configSchema.safeParse(env);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${problems}\n\nSee .env.example for the full list.`,
    );
  }

  return result.data;
}
