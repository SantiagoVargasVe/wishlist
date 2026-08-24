import { nanoid } from "nanoid";

/**
 * Opaque bearer token for undoing an anonymous claim. Unlike slugs and invite
 * codes, nobody transcribes this by hand — it's only ever read back from
 * localStorage and sent in a request body — so it needs no restricted
 * alphabet, just entropy.
 *
 * 24 chars from nanoid's default 64-symbol alphabet is ~144 bits, comfortably
 * over the 128-bit floor.
 */
export function generateClaimToken(): string {
  return nanoid(24);
}
