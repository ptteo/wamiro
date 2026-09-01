import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { create, listRecent, remove } from "@/modules/announcements/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ announcements: await listRecent(auth) });
});

const createSchema = z.object({
  title: z.string().min(3).max(150),
  body: z.string().min(3).max(5000),
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

export const DELETE = route(
  async (req: NextRequest, { auth }) => {
    const body = (await req.json().catch(() => null)) as { id?: string } | null;
    if (!body?.id || !/^[0-9a-f-]{36}$/i.test(body.id)) {
      throw ApiError.badRequest("id required");
    }
    await remove(auth, body.id);
    return NextResponse.json({ ok: true });
  },
  { permission: "announcements.manage" },
);
