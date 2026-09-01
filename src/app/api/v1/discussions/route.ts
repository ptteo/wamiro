import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createDiscussion, listDiscussions } from "@/modules/discussions/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ discussions: await listDiscussions(auth) });
});

const createSchema = z.object({
  title: z.string().min(3).max(300),
  body: z.string().min(1).max(20_000),
  pinned: z.boolean().optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Title and body required", parsed.error.flatten());
    const row = await createDiscussion(auth, parsed.data);
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  },
);
