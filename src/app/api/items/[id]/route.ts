import { updateItemSchema } from "@/lib/schemas/item";
import { requireUserId } from "@/server/auth/session";
import { deleteItem, updateItem } from "@/server/services/items";

import { handle } from "../../_lib/respond";

type Context = { params: Promise<{ id: string }> };

/** PATCH /api/items/:id — owner only, 404 for missing or soft-deleted. */
export const PATCH = handle(async (request, { params }: Context) => {
  const userId = await requireUserId();
  const { id } = await params;
  const input = updateItemSchema.parse(await request.json());

  const item = await updateItem(id, userId, input);
  return Response.json({ item });
});

/** DELETE /api/items/:id — owner only. Soft delete; removes every list membership. */
export const DELETE = handle(async (request, { params }: Context) => {
  const userId = await requireUserId();
  const { id } = await params;

  await deleteItem(id, userId);
  return new Response(null, { status: 204 });
});
