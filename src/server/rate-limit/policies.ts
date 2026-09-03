/**
 * Rate limit policies, declared in one place rather than as literals scattered
 * across route handlers — otherwise nobody can answer "what are our limits?"
 * without grepping.
 *
 * Starting points from docs/context/api-contract.md; tune once there's real
 * traffic. Cloudflare WAF rules (T064) sit in front of these as the first line.
 */
export type RateLimitPolicy = {
  /** Maximum burst. */
  capacity: number;
  /** Seconds for a bucket to refill from empty to full. */
  windowSeconds: number;
};

const MINUTE = 60;
const HOUR = 60 * 60;
const DAY = 24 * HOUR;

export const policies = {
  /**
   * Tight because Argon2 verification costs ~50-100ms of CPU and 19 MB per
   * attempt. This is about protecting the box as much as the accounts.
   */
  login: { capacity: 10, windowSeconds: 15 * MINUTE },

  /** The invite gate stops account creation; this stops the attempts. */
  register: { capacity: 5, windowSeconds: HOUR },

  /** T032. Each call makes the server fetch a third-party URL. */
  preview: { capacity: 30, windowSeconds: HOUR },

  /** T040. Per IP; there is a separate per-slug cap in the contract. */
  claim: { capacity: 20, windowSeconds: HOUR },

  /** T070. Minting is deliberate and infrequent — a handful of relatives, not bulk. */
  invite: { capacity: 5, windowSeconds: DAY },

  /**
   * T103, per ADR-0012. Applied twice per request — once per IP, once per
   * submitted email address — and neither substitutes for the other: the IP
   * bucket stops a spray across many accounts, the email bucket stops
   * mailbombing one person's inbox from many addresses.
   *
   * 3/hour because someone who genuinely needs a reset asks once, maybe twice
   * after not finding the mail. It is also the only cap on how much outbound
   * mail one address can cause, which matters on a provider with a daily
   * ceiling.
   */
  passwordResetRequest: { capacity: 3, windowSeconds: HOUR },

  /**
   * T103, per IP. With 256 bits of entropy this is not stopping a guess — the
   * token does that. It stops CPU burn: every attempt costs an Argon2 hash of
   * the submitted password whether or not the token is real, so an unbounded
   * endpoint is a free way to pin the box.
   */
  passwordResetConsume: { capacity: 10, windowSeconds: 15 * MINUTE },

  /**
   * T108, per IP. The verify endpoint is unauthenticated and consumes a token,
   * so it needs its own cap (ADR-0013). Roomier than the reset equivalent
   * because it costs no Argon2 hash — this is only about a client hammering a
   * DB write path.
   */
  emailVerify: { capacity: 20, windowSeconds: 15 * MINUTE },

  /**
   * T108, per user — the endpoint is authenticated, so the account is the
   * honest key. Each call sends real mail to a real inbox, and someone who
   * hasn't received the first one within a few tries has a problem no further
   * resend will fix.
   */
  emailVerifyResend: { capacity: 3, windowSeconds: HOUR },
} as const satisfies Record<string, RateLimitPolicy>;
