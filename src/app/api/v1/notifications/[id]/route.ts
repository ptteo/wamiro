import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { markRead } from "@/modules/notifications/service";

const bodySchema = z
  .object({
    action: z.enum(["read"]),
  })
  .strict();

/** Per-notification read endpoint. PATCH { action: "read" }. */
export const PATCH = route(async (req: NextRequest, { auth, params }) => {
  const id = params["id"];
  if (!id) throw ApiError.badRequest("Notification id required");
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest("Invalid payload");
  if (parsed.data.action === "read") {
    const ok = await markRead(auth, id);
    if (!ok) throw ApiError.notFound();
  }
  return NextResponse.json({ ok: true });
});
