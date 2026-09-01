import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { completionStats, create } from "@/modules/acknowledgements/service";

export const GET = route(
  async (_req, { auth }) => NextResponse.json({ stats: await completionStats(auth) }),
  { permission: "announcements.manage" },
);

const createSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(10).max(20_000),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Title and body required", parsed.error.flatten());
    const row = await create(auth, parsed.data);
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  },
  { permission: "announcements.manage" },
);
