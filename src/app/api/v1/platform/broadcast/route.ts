import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { broadcastAnnouncement } from "@/modules/platform/console";

const bodySchema = z.object({
  title: z.string().min(3).max(300),
  body: z.string().min(3).max(10_000),
});

/** Phase E.3 — fan a product announcement out to every active tenant. */
export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid broadcast", parsed.error.flatten());
    const result = await broadcastAnnouncement(auth, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  },
  { permission: "platform.admin" },
);
