import "server-only";

import { ForbiddenError, NotFoundError } from "../errors";

/**
 * The ownership check every "O" (owner-only) service function needs, in one
 * place so it's not reimplemented slightly differently per resource.
 *
 * Enforces the split api-contract.md already documents: **404** when the
 * resource is genuinely missing (or soft-deleted), **403** when it exists but
 * belongs to someone else. Conflating the two either leaks existence through a
 * 403 an attacker didn't earn, or hides a real permission problem behind a
 * misleading 404 — the caller-supplied `notFound` factory keeps each resource
 * type's error code and message correct while sharing this logic.
 *
 * Lives under `auth/` rather than `db/` — this is an authorization concern,
 * not a data-access one, even though it operates on a fetched row.
 */
export function assertOwned<T extends { ownerId: string }>(
  resource: T | null | undefined,
  userId: string,
  notFound: () => NotFoundError,
): T {
  if (!resource) throw notFound();
  if (resource.ownerId !== userId) throw new ForbiddenError();
  return resource;
}
