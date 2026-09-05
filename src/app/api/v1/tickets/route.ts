import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createTicket, listTickets, type SlaState } from "@/modules/tickets/service";

/** Optional query filters: ?status=open&sla=at_risk|breached */
export const GET = route(async (req, { auth }) => {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? undefined;
  const slaParam = sp.get("sla");
  const sla: SlaState | undefined =
    slaParam === "at_risk" || slaParam === "breached" ? slaParam : undefined;
  return NextResponse.json({ tickets: await listTickets(auth, { status, sla }) });
});

const createSchema = z.object({
  title: z.string().min(3).max(300),
  description: z.string().min(5).max(10_000),
  category: z.enum(["incident", "service_request", "access", "hardware", "software", "platform", "other"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid ticket", parsed.error.flatten());
    const row = await createTicket(auth, parsed.data);
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  },
);
