import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import {
  createInvitation,
  listPendingInvites,
} from "@/modules/invitations/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ invites: await listPendingInvites(auth) });
});

const bodySchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(200),
  roleKey: z.string().min(2).max(50).default("employee"),
  managerUserId: z.string().uuid().optional(),
});

export const POST = route(async (req: NextRequest, { auth }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
  const result = await createInvitation(auth, parsed.data);
  return NextResponse.json({ ok: true, ...result }, { status: 201 });
});
