/**
 * Client-side mirror of the wire error envelope
 * (`{ error: { code, message, details? } }`, see docs/context/api-contract.md).
 *
 * Deliberately not the server's `DomainError` — the client only needs the
 * *shape* the API promises, not server logic. Importing across that boundary
 * would couple a client bundle to backend code for no reason.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Narrows `unknown` (as caught in a query/mutation) to an `ApiError`, optionally of one code. */
export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}
