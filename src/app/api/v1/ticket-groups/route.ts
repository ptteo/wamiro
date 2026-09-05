import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createGroup, listGroups } from "@/modules/ticket-groups/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ groups: await listGroups(auth) });
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(300).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid group", parsed.error.flatten());
    const row = await createGroup(auth, parsed.data);
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  },
);