import { z } from "zod";

import { INVITE_CODE_LENGTH } from "../invite-code";

/**
 * Shared between the API route and the registration form (T014).
 *
 * One schema means client and server cannot disagree about what's valid, and
 * adding a field is a single edit. Server-side validation stays mandatory
 * regardless — the client is not a trust boundary.
 */

/**
 * Codes are transcribed by hand: read aloud, typed from a screenshot,
 * copy-pasted with a stray space. Normalise before validating so `k7mq-2xpt9r`
 * and `K7MQ 2XPT9R` both work.
 */
export const inviteCodeInput = z
  .string()
  .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
  .pipe(
    z
      .string()
      .length(INVITE_CODE_LENGTH, "Invite codes are 10 characters"),
  );

export const registerSchema = z.object({
  email: z.email("Enter a valid email address").max(254),
  // Minimum for strength; maximum because Argon2 is deliberately expensive and
  // an unbounded password is a cheap denial-of-service.
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(128, "Use at most 128 characters"),
  displayName: z.string().trim().min(1, "Enter a name").max(80),
  inviteCode: inviteCodeInput,
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;
