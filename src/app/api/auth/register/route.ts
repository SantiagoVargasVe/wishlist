import { clientIp } from "@/server/rate-limit/client-ip";
import { enforce } from "@/server/rate-limit";
import { policies } from "@/server/rate-limit/policies";
import { registerUser } from "@/server/services/auth";
import { registerSchema } from "@/lib/schemas/auth";

import { handle } from "../../_lib/respond";

/**
 * POST /api/auth/register
 *
 * Thin by design: parse, delegate, serialise. Any domain rule that looks like
 * an `if` belongs in the service.
 *
 * No session cookie yet — that arrives with T012, which owns JWT issuing.
 */
export const POST = handle(async (request) => {
  await enforce(policies.register, `register:${clientIp(request)}`);

  const input = registerSchema.parse(await request.json());
  const user = await registerUser(input);

  return Response.json({ user }, { status: 201 });
});
