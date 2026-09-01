import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createTicket, listMyTickets, zammadConfig } from "@/modules/integrations/zammad";

function requireZammad() {
  if (!zammadConfig()) {
    throw ApiError.badRequest(
      "Helpdesk is not connected yet. An administrator must set ZAMMAD_BASE_URL and ZAMMAD_TOKEN.",
    );
  }
}

export const GET = route(async (_req, { auth }) => {
  requireZammad();
  try {
    return NextResponse.json({ tickets: await listMyTickets(auth.user.email) });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("zammad ")) {
      throw ApiError.badRequest("Helpdesk unreachable — please try again later");
    }
    throw e;
  }
});

const createSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(5).max(10_000),
});

export const POST = route(async (req: NextRequest, { auth }) => {
  requireZammad();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Title and description required");
  const { id } = await createTicket(auth.user.email, auth.user.name, parsed.data);
  return NextResponse.json({ ok: true, id }, { status: 201 });
});
