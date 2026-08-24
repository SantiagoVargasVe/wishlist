import { createItemSchema } from "@/lib/schemas/item";
import { requireUserId } from "@/server/auth/session";
import { createItem } from "@/server/services/items";

import { handle } from "../_lib/respond";

/**
 * POST /api/items
 *
 * Pure manual entry — the OG scraper (T030-T034) doesn't exist yet, so
 * everything here comes from what the caller sends, not a fetched page.
 */
export const POST = handle(async (request) => {
  const userId = await requireUserId();
  const input = createItemSchema.parse(await request.json());
  const item = await createItem(userId, input);

  return Response.json({ item }, { status: 201 });
});
