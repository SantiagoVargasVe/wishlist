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
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 409, details);
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

/** Wishlist-specific failures. */
export const WishlistErrors = {
  notFound: () => new NotFoundError("WISHLIST_NOT_FOUND", "Wishlist not found"),
  cannotDeleteDefault: () =>
    new ConflictError(
      "DEFAULT_WISHLIST_UNDELETABLE",
      "The default wishlist can't be deleted",
    ),
  /**
   * The "prompt" data-model.md describes: deleting this list would orphan
   * items that live nowhere else. Nothing is deleted; the client re-requests
   * with `?deleteOrphans=true` once the user confirms.
   */
  confirmDeleteOrphans: (orphans: { id: string; title: string }[]) =>
    new ConflictError(
      "CONFIRM_DELETE_ORPHANS",
      "Some items only belong to this list — confirm to delete them too",
      { orphanItems: orphans },
    ),
};

/**
 * Deliberately generic. Distinguishing "no such user" from "wrong password"
 * tells an attacker which addresses are registered.
 */
export const invalidCredentials = () =>
  new DomainError("INVALID_CREDENTIALS", "Email or password is incorrect", 401);

/** Item-specific failures. */
export const ItemErrors = {
  notFound: () => new NotFoundError("ITEM_NOT_FOUND", "Item not found"),
  /**
   * Filing an item into a list the caller doesn't own — or one that doesn't
   * exist — isn't representable. A 400 rather than 403/404: this validates
   * the whole request body before anything is created, the same way a
   * malformed field would.
   */
  invalidWishlists: (ids: string[]) =>
    new ValidationError("One or more lists don't exist or aren't yours", {
      invalidWishlistIds: ids,
    }),
};
