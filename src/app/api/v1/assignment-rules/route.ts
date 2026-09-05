import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createRule, listRules } from "@/modules/ticket-groups/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ rules: await listRules(auth) });
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  groupId: z.string().uuid().nullable().optional(),
  category: z.string().max(40).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid rule", parsed.error.flatten());
    const row = await createRule(auth, parsed.data);
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  },
);