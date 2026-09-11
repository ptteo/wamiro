import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import {
  approveDestructiveOp,
  listPending,
  rejectDestructiveOp,
} from "@/modules/platform/destructive-ops";

/** Phase B-fix — pending two-person approvals for destructive subscription ops. */
export const GET = route(
  async (_req, { auth }) => {
    return NextResponse.json({ ops: await listPending(auth) });
  },
  { permission: "platform.admin" },
);

const postSchema = z.object({
  opId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid request", parsed.error.flatten());
    const result =
      parsed.data.action === "approve"
        ? await approveDestructiveOp(auth, parsed.data.opId)
        : await rejectDestructiveOp(auth, parsed.data.opId);
    return NextResponse.json(result);
  },
  { permission: "platform.admin" },
);
