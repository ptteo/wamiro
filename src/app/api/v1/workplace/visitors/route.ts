import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { inviteVisitor, myVisitors, visitorCheck } from "@/modules/workplace/service";

export const GET = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json({ visitors: await myVisitors(auth) });
  },
  { permission: "workplace.view" },
);

const inviteSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(200).optional(),
  visitDate: z.string().min(8).max(10),
});
const actionSchema = z.object({
  action: z.enum(["checkin", "checkout", "cancel"]),
  id: z.string().uuid(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const body = await req.json().catch(() => null);
    if (body && typeof body === "object" && "action" in body) {
      const parsed = actionSchema.safeParse(body);
      if (!parsed.success) throw ApiError.badRequest("Invalid payload");
      await visitorCheck(auth, parsed.data.id, parsed.data.action);
      return NextResponse.json({ ok: true });
    }
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) throw ApiError.badRequest("name + visitDate required", parsed.error.flatten());
    const id = await inviteVisitor(auth, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  },
  { permission: "workplace.book" },
);
