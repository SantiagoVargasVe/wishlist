import { ZodError } from "zod";

import { DomainError } from "@/server/errors";

/**
 * The single place domain errors become HTTP responses.
 *
 * Services throw typed errors and never build responses; route handlers call
 * this. One mapper means the envelope in docs/context/api-contract.md stays
 * consistent without every handler reimplementing it.
 */

export type ErrorEnvelope = {
  error: { code: string; message: string; details?: Record<string, unknown> };
};

export function errorResponse(error: unknown): Response {
  if (error instanceof DomainError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      } satisfies ErrorEnvelope,
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: "Some fields are invalid",
          details: {
            issues: error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
        },
      } satisfies ErrorEnvelope,
      { status: 400 },
    );
  }

  // Anything unrecognised is a bug. Log the detail, return nothing useful —
  // internal errors are exactly the kind of thing that leaks implementation
  // detail to whoever is probing.
  console.error("Unhandled error in route handler:", error);
  return Response.json(
    { error: { code: "INTERNAL", message: "Something went wrong" } } satisfies ErrorEnvelope,
    { status: 500 },
  );
}

/** Wrap a handler so thrown domain errors become the right response. */
export function handle(
  fn: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await fn(request);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
