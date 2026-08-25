import { previewSchema } from "@/lib/schemas/preview";
import { requireUserId } from "@/server/auth/session";
import { getPreview } from "@/server/og/preview";
import { enforce } from "@/server/rate-limit";
import { policies } from "@/server/rate-limit/policies";

import { handle } from "../_lib/respond";

/**
 * POST /api/preview — authenticated, so the SSRF surface (an outbound fetch
 * of a user-supplied URL) is never exposed anonymously. A failed scrape is
 * still a `200` — see `getPreview`; the scrape is a prefill suggestion, not
 * a gate.
 */
export const POST = handle(async (request) => {
  const userId = await requireUserId();
  await enforce(policies.preview, `preview:${userId}`);

  const { url } = previewSchema.parse(await request.json());
  const result = await getPreview(url);

  return Response.json(result);
});
