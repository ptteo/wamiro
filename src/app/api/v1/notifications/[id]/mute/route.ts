import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { setThreadMuted } from "@/modules/notifications/service";

const bodySchema = z.object({ muted: z.boolean() });

/** Phase 8 — mute/unmute a thread. Uses the notification id as the thread key. */
export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw ApiError.badRequest("Notification id required");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("muted boolean required", parsed.error.flatten());
    await setThreadMuted(auth, id, parsed.data.muted);
    return NextResponse.json({ ok: true });
  },
);
