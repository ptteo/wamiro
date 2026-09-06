import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { cancelLeave } from "@/modules/leave/service";

const bodySchema = z.object({
  note: z.string().max(500).optional(),
  force: z.boolean().optional(),
});

export const POST = route(async (req: NextRequest, { auth, params }) => {
  const id = params["id"];
  if (!id) throw ApiError.badRequest("Missing request id");
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw ApiError.badRequest("Invalid cancel request", parsed.error.flatten());
  await cancelLeave(auth, id, parsed.data);
  return NextResponse.json({ ok: true });
});
