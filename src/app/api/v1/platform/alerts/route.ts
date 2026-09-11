import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { actOnAlert, alertInbox } from "@/modules/platform/alerts";

/** Phase D — alert inbox (§4.3): open/acknowledged instances → act. */
export const GET = route(
  async (req: NextRequest, { auth }) => {
    const state = req.nextUrl.searchParams.get("state") ?? undefined;
    return NextResponse.json({ alerts: await alertInbox(auth, state) });
  },
  { permission: "platform.admin" },
);

const postSchema = z.object({
  alertId: z.string().uuid(),
  action: z.enum(["acknowledge", "resolve"]),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid request", parsed.error.flatten());
    await actOnAlert(auth, parsed.data.alertId, parsed.data.action);
    return NextResponse.json({ ok: true });
  },
  { permission: "platform.admin" },
);
