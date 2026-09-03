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
      .length(INVITE_CODE_LENGTH, "Los códigos de invitación tienen 10 caracteres"),
  );

/**
 * Minimum for strength; maximum because Argon2 is deliberately expensive and an
 * unbounded password is a cheap denial-of-service.
 *
 * Shared by registration and password reset rather than restated: a reset that
 * accepted a weaker password than registration would be a way around the rule,
 * and two copies drift the moment one is edited.
 */
export const passwordInput = z
  .string()
  .min(10, "Usa al menos 10 caracteres")
  .max(128, "Usa como máximo 128 caracteres");

export const emailInput = z.email("Ingresa un correo electrónico válido").max(254);

export const registerSchema = z.object({
  email: emailInput,
  password: passwordInput,
  displayName: z.string().trim().min(1, "Ingresa un nombre").max(80),
  inviteCode: inviteCodeInput,
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailInput,
  password: z.string().min(1, "Ingresa tu contraseña").max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * The token from a `/verify-email/[token]` or `/reset-password/[token]` link.
 *
 * 32 random bytes, base64url — 43 characters, no padding. Bounded rather than
 * merely non-empty so a megabyte of garbage is rejected at the boundary instead
 * of reaching a SHA-256 and a database round trip.
 */
export const tokenInput = z
  .string()
  .min(1, "Falta el enlace")
  .max(200, "Ese enlace no es válido");

export const verifyEmailSchema = z.object({ token: tokenInput });

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const forgotPasswordSchema = z.object({ email: emailInput });

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: tokenInput,
  password: passwordInput,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
