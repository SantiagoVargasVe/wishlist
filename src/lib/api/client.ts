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

  // DELETE and some POSTs (e.g. list-membership) return 204 with no body —
  // nothing to parse, and a plain `.json()` call would throw on empty input.
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
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
