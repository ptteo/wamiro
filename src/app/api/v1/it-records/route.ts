import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createRecord, listRecords, type ItType } from "@/modules/it-records/service";

export const GET = route(async (req, { auth }) => {
  const type = (req.nextUrl.searchParams.get("type") ?? "incident") as ItType;
  return NextResponse.json({ records: await listRecords(auth, type) });
});

const createSchema = z.object({
  type: z.enum(["incident", "problem", "change"]),
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  impact: z.string().max(500).optional(),
  priority: z.string().max(20).optional(),
  affectedService: z.string().max(200).optional(),
  windowStart: z.string().optional(),
  windowEnd: z.string().optional(),
  risk: z.string().max(500).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid IT record", parsed.error.flatten());
    const row = await createRecord(auth, parsed.data);
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  },
);