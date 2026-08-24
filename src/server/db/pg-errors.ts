/**
 * Postgres SQLSTATE codes.
 * https://www.postgresql.org/docs/current/errcodes-appendix.html
 *
 * Prefer these over matching error message text: messages shift between
 * Postgres versions and locales, while `23505` always means unique violation.
 */
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
export const PG_CHECK_VIOLATION = "23514";
export const PG_NOT_NULL_VIOLATION = "23502";

/**
 * Extract the SQLSTATE from a thrown error.
 *
 * Drizzle wraps driver errors in its own `Failed query: ...` message, so the
 * Postgres detail lives on `error.cause`.
 */
export function pgCodeOf(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

export function isPgError(error: unknown, code: string): boolean {
  return pgCodeOf(error) === code;
}
