import { customAlphabet } from "nanoid";

/**
 * Share-link slugs.
 *
 * Lowercase because these live in URLs and get read aloud. `l`, `o`, `0`, and
 * `1` are excluded for the same transcription reasons as invite codes — a
 * wishlist link that lands on the wrong page because someone heard "ell" for
 * "one" is a confusing failure.
 *
 * 32 characters over 10 positions is about 2^50 possibilities. **Possession of
 * the slug is the permission** for a shared list, so this has to be
 * unguessable, not merely unique.
 */
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

const LENGTH = 10;

const nanoid = customAlphabet(ALPHABET, LENGTH);

/** A share slug, e.g. `k7mq2xpt9r`. */
export function generateSlug(): string {
  return nanoid();
}

export const SLUG_ALPHABET = ALPHABET;
export const SLUG_LENGTH = LENGTH;
