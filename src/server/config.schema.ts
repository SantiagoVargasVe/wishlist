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

/**
 * An optional setting that treats a blank value as absent.
 *
 * Necessary because of how the environment actually arrives in production.
 * Compose's `${VAR:-}` **sets the variable to an empty string** rather than
 * omitting it — measured, not assumed — so an operator who leaves a key out of
 * their `.env` gets `VAR=""` inside the container, not nothing. Every optional
 * key here is `.min(1)`, and `""` is a string, so without this it fails
 * validation and the whole app refuses to boot over a feature nobody asked for.
 *
 * Whitespace is trimmed first, so `MAIL_SMTP_PASS=" "` reads as absent too:
 * that is a typo, never a password.
 *
 * Deliberately **not** applied to required keys. An empty `AUTH_SECRET` should
 * fail as loudly as a missing one.
 */
function optionalEnv<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );
}

const baseConfigSchema = z.object({
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

  // Decompression-bomb ceiling, and the guard a byte limit cannot replace: a
  // 12000x12000 single-colour PNG is ~436KB on the wire but ~430MB decoded.
  // sharp's own default only trips near 268 megapixels, far too generous for a
  // small self-hosted box that shares its RAM with everything else. 40MP still
  // clears a 48MP phone photo's usable range and any retailer product shot.
  IMAGE_MAX_PIXELS: z.coerce.number().int().positive().default(40_000_000),

  // Cap on a user-supplied upload, applied before anything is decoded. Smaller
  // than OG_MAX_IMAGE_BYTES on purpose: that one covers a retailer CDN we
  // chose to fetch, this one covers an arbitrary POST body.
  IMAGE_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(8_388_608),

  OG_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  OG_MAX_HTML_BYTES: z.coerce.number().int().positive().default(2_097_152),
  OG_MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(10_485_760),
  OG_CACHE_TTL_HOURS: z.coerce.number().int().positive().default(168),
  // Several large retailers' CDNs decide at the edge, on User-Agent alone,
  // whether a request reaches their origin at all: a bot-shaped UA gets a
  // 403, a browser-shaped one gets an unsolvable JS challenge, and only a
  // `WhatsApp/`-prefixed one gets the page. The appended URL is what keeps
  // this from being bare impersonation — an operator reading their logs can
  // see what this is and block it specifically. See ADR-0010 for the
  // measurements and the tradeoff; set this to `WishlistBot/1.0` to opt out.
  OG_USER_AGENT: z
    .string()
    .min(1)
    .default("WhatsApp/2.0 (+https://github.com/SantiagoVargasVe/wishlist)"),

  // MercadoLibre catalog-product lookups (T036). Optional: an operator who
  // hasn't registered a MercadoLibre developer app just leaves these unset,
  // and MercadoLibre links fall through to the generic scrape exactly as
  // before — this integration is additive, never a new hard dependency.
  MELI_CLIENT_ID: optionalEnv(z.string().min(1)),
  MELI_CLIENT_SECRET: optionalEnv(z.string().min(1)),

  // Outbound SMTP (ADR-0011). All five optional: an operator running no mail
  // vendor is a supported configuration, not a broken one, so unset means the
  // app boots normally with email disabled. Anything built on top degrades
  // rather than breaks — `scripts/reset-link.ts` (T106) is the recovery path
  // in that configuration.
  //
  // The provider is entirely a matter of these five values; nothing in the
  // code knows Resend exists.
  MAIL_SMTP_HOST: optionalEnv(z.string().min(1)),
  // The blank-to-absent step runs *before* coercion, deliberately: `Number("")`
  // is 0, so without it an unset port would fail as "not positive" rather than
  // reading as absent.
  MAIL_SMTP_PORT: optionalEnv(z.coerce.number().int().positive()),
  MAIL_SMTP_USER: optionalEnv(z.string().min(1)),
  MAIL_SMTP_PASS: optionalEnv(z.string().min(1)),
  // A bare address, not `Name <addr@host>`. Narrower than SMTP allows, on
  // purpose: a malformed From is the kind of thing that fails at the provider
  // on the one send that matters, and this is the cheap place to catch it.
  MAIL_FROM: optionalEnv(z.email()),
});

/** The five keys that make up the mail transport, as one all-or-nothing group. */
const MAIL_KEYS = [
  "MAIL_SMTP_HOST",
  "MAIL_SMTP_PORT",
  "MAIL_SMTP_USER",
  "MAIL_SMTP_PASS",
  "MAIL_FROM",
] as const;

/**
 * Mail config is all-or-nothing.
 *
 * A half-configured mailer — a host with no password, say — is the worst of
 * the three states: `isMailConfigured()` would have to pick a side, and
 * whichever it picked, the failure surfaces at 3am on the one send that
 * matters rather than at boot. Either all five are set or none are.
 */
export const configSchema = baseConfigSchema.superRefine((config, ctx) => {
  const missing = MAIL_KEYS.filter((key) => config[key] === undefined);
  if (missing.length === 0 || missing.length === MAIL_KEYS.length) return;

  for (const key of missing) {
    ctx.addIssue({
      code: "custom",
      path: [key],
      message:
        "mail is partially configured — set all of MAIL_SMTP_HOST, MAIL_SMTP_PORT, " +
        "MAIL_SMTP_USER, MAIL_SMTP_PASS and MAIL_FROM, or none of them",
    });
  }
});

export type Config = z.infer<typeof configSchema>;

/**
 * Validate an environment object, throwing with *every* problem listed rather
 * than only the first — fixing config one error per restart is miserable.
 */
/**
 * Build a memoized, *lazy* config accessor.
 *
 * Laziness matters for one specific reason: `next build` evaluates modules to
 * do static analysis, so validating at import time would make the production
 * build demand real runtime secrets just to compile — and every Docker build
 * would need placeholder values that could mask a genuine misconfiguration.
 *
 * Fail-fast isn't lost, it just moves to the right moment: `instrumentation.ts`
 * calls the accessor once at server startup, so a bad environment still stops
 * the app at boot rather than on the first request.
 */
export function createConfigAccessor(
  readEnv: () => Record<string, string | undefined>,
): () => Config {
  let cached: Config | undefined;
  return () => (cached ??= parseConfig(readEnv()));
}

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
