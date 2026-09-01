import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { create, list } from "@/modules/knowledge/service";

export const GET = route(
  async (_req, { auth }) => {
    return NextResponse.json({ articles: await list(auth) });
  },
  { permission: "knowledge.view" },
);

const createSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(3).max(50_000),
  tags: z.array(z.string().min(1).max(30)).max(8).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Title and body required", parsed.error.flatten());
    const row = await create(auth, parsed.data);
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  },
  { permission: "knowledge.manage" },
);
