import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createPlatformSupportTicket } from "@/modules/help/service";

const schema = z.object({
  title: z.string().min(3).max(300),
  description: z.string().min(5).max(10_000),
});

export const POST = route(async (req: NextRequest, { auth }) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Invalid payload", parsed.error.flatten());
  const row = await createPlatformSupportTicket(auth, parsed.data);
  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
});
