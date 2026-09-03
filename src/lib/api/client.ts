import { ApiError } from "./errors";

/**
 * The single choke point for talking to our own API. No component or hook
 * should call bare `fetch()` against `/api/*` — everything goes through this,
 * so JSON parsing, error mapping, and auth handling live in one place.
 *
 * Auth rides along for free: the session is a same-origin httpOnly cookie
 * (ADR-0003), so there's no token to attach and no header to manage here.
 */
export async function apiFetch<T = void>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  // Several routes answer with no body at all: 204 from DELETE and
  // list-membership, and 202 from `/api/auth/forgot-password`, whose empty body
  // is deliberate — it is what makes every outcome byte-identical (T103).
  // Reading as text first and parsing only when there is something to parse
  // covers all of them; a bare `.json()` throws a SyntaxError on empty input,
  // which would surface a successful request to the user as a failure.
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const error = body?.error;

  return new ApiError(
    error?.code ?? "UNKNOWN",
    error?.message ?? "Something went wrong",
    response.status,
    error?.details,
  );
}
