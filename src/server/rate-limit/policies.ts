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
} as const satisfies Record<string, RateLimitPolicy>;
