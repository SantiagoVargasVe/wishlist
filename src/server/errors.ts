/**
 * Typed domain errors.
 *
 * Services throw these; one mapper turns them into the wire envelope
 * (see src/app/api/_lib/respond.ts). Services never build responses — that's
 * what keeps them framework-agnostic and testable without booting Next.
 *
 * `code` is a stable machine-readable string the client can branch on.
 * `message` is for humans and may change freely.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VALIDATION_FAILED", message, 400, details);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "Not permitted") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message, 404);
  }
}

export class ConflictError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message, 409);
  }
}

export class RateLimitError extends DomainError {
  constructor(retryAfterSeconds: number) {
    super("RATE_LIMITED", "Too many requests", 429, { retryAfterSeconds });
  }
}

/** Registration-specific failures. */
export const InviteErrors = {
  invalid: () =>
    new ValidationError("That invite code is not valid", {
      field: "inviteCode",
    }),
  alreadyUsed: () =>
    new ConflictError("INVITE_ALREADY_USED", "That invite code has been used"),
  expired: () =>
    new ValidationError("That invite code has expired", {
      field: "inviteCode",
    }),
};

export const emailTaken = () =>
  new ConflictError("EMAIL_TAKEN", "An account with that email already exists");

/**
 * Deliberately generic. Distinguishing "no such user" from "wrong password"
 * tells an attacker which addresses are registered.
 */
export const invalidCredentials = () =>
  new DomainError("INVALID_CREDENTIALS", "Email or password is incorrect", 401);
