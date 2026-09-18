import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { listOperators, setOperatorRole } from "@/modules/platform/entitlements";

/** Phase F — platform-team operator roles (§3.7). */
export const GET = route(
  async (_req, { auth }) => {
    return NextResponse.json({ operators: await listOperators(auth) });
  },
  { permission: "platform.admin" },
);

const postSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["viewer", "operator", "admin"]),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid request", parsed.error.flatten());
    await setOperatorRole(auth, parsed.data.userId, parsed.data.role);
    return NextResponse.json({ ok: true });
  },
  { permission: "platform.admin" },
);
