import { isNull } from "drizzle-orm";

import { items } from "./schema";

/**
 * Excludes soft-deleted items.
 *
 * Every read of `items` must apply this. It exists as a shared constant rather
 * than a repeated `isNull(items.deletedAt)` so that forgetting it is visible in
 * review — a query without it silently resurrects deleted items, which is the
 * kind of bug that shows up as "why is that back on my list?".
 *
 *   db.select().from(items).where(and(liveItem, eq(items.ownerId, userId)))
 */
export const liveItem = isNull(items.deletedAt);
