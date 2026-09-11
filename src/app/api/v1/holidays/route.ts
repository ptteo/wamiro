import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { addHoliday, listHolidays, removeHoliday } from "@/modules/calendar/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ holidays: await listHolidays(auth) });
});

const addSchema = z.object({
  name: z.string().min(2).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  location: z.string().max(80).nullable().optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = addSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Name and date required", parsed.error.flatten());
    await addHoliday(auth, parsed.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  },
  { permission: "settings.manage" },
);

export const DELETE = route(
  async (req: NextRequest, { auth }) => {
    const body = (await req.json().catch(() => null)) as { id?: string } | null;
    if (!body?.id || !/^[0-9a-f-]{36}$/i.test(body.id)) {
      throw ApiError.badRequest("id required");
    }
    await removeHoliday(auth, body.id);
    return NextResponse.json({ ok: true });
  },
  { permission: "settings.manage" },
);
