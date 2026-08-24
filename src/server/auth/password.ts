import "server-only";

import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id password hashing.
 *
 * Not bcrypt (72-byte input truncation, weaker against GPU attack) and
 * certainly not a bare SHA. Argon2id is memory-hard, which is what makes
 * large-scale cracking expensive rather than merely slow.
 *
 * Parameters are OWASP's current baseline: 19 MiB, 2 iterations, parallelism 1.
 * They're recorded in the hash string itself, so raising them later doesn't
 * invalidate existing hashes — `verify` reads each hash's own parameters.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

/**
 * Returns false rather than throwing on a malformed hash. A corrupt row should
 * deny access, not surface a 500 that tells an attacker something went wrong.
 */
export async function verifyPassword(
  plain: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}
