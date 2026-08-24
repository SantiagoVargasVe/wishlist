import { customAlphabet } from "nanoid";

/**
 * Alphabet chosen for transcription, not density.
 *
 * Excludes 0/O, 1/I/L, and lowercase entirely — these codes get read aloud over
 * the phone, typed from a screenshot, or forwarded in a chat message. An invite
 * that fails because someone typed O for 0 is a support conversation.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const LENGTH = 10;

const nanoid = customAlphabet(ALPHABET, LENGTH);

/** A single-use registration code, e.g. `K7MQ2XPT9R`. */
export function generateInviteCode(): string {
  return nanoid();
}

export const INVITE_CODE_ALPHABET = ALPHABET;
export const INVITE_CODE_LENGTH = LENGTH;
