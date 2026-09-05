import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { platformSupportQueue, escalateTicket, platformTicketReply } from "@/modules/platform/console";

/** Phase E.4 — the platform support queue (escalated tenant tickets). */
export const GET = route(
  async (_req, { auth }) => {
    return NextResponse.json({ tickets: await platformSupportQueue(auth) });
  },
  { permission: "platform.admin" },
);

/** Pull a tenant ticket into the queue (notify-once via escalated_at). */
export const POST = route(
  async (req: NextRequest, { auth }) => {
    const body = ((await req.json().catch(() => null)) ?? {}) as { ticketId?: string };
    if (!body.ticketId) throw ApiError.badRequest("ticketId required");
    await escalateTicket(auth, body.ticketId);
    return NextResponse.json({ ok: true });
  },
  { permission: "platform.admin" },
);

const replySchema = z.object({ ticketId: z.string().uuid(), body: z.string().min(1).max(10_000) });

/** Reply to an escalated ticket as the platform operator. */
export const PUT = route(
  async (req: NextRequest, { auth }) => {
    const parsed = replySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid reply", parsed.error.flatten());
    await platformTicketReply(auth, parsed.data.ticketId, parsed.data.body);
    return NextResponse.json({ ok: true });
  },
  { permission: "platform.admin" },
);
