import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { logReviewKeep } from "@/modules/admin/service";

const keepSchema = z.object({
  kind: z.enum(["override", "role"]),
  refId: z.string().uuid(),
  userName: z.string().min(1).max(120),
  detail: z.string().min(1).max(200),
});

/** Record an "approved / kept" review decision (revokes use their own endpoints). */
export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = keepSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid review item", parsed.error.flatten());
    await logReviewKeep(auth, parsed.data);
    return NextResponse.json({ ok: true });
  },
  { permission: "roles.manage" },
);
