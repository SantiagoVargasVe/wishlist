import { createItemSchema } from "@/lib/schemas/item";
import { requireUserId } from "@/server/auth/session";
import { downloadItemImage } from "@/server/og/image";
import { createItem } from "@/server/services/items";

import { handle } from "../_lib/respond";

/**
 * POST /api/items
 *
 * The image download (T033) is fired here, unawaited, rather than inside
 * `createItem()` — the service stays a plain DB write with no network
 * involved, which is what lets its own tests run against a real Postgres
 * database with nothing to mock. `downloadItemImage()` never throws, so
 * there's nothing for this handler to catch.
 */
export const POST = handle(async (request) => {
  const userId = await requireUserId();
  const input = createItemSchema.parse(await request.json());
  const item = await createItem(userId, input);

  if (item.sourceImageUrl) {
    void downloadItemImage(item.id, item.sourceImageUrl);
  }

  return Response.json({ item }, { status: 201 });
});
