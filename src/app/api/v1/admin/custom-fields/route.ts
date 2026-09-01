import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createDef, listDefs } from "@/modules/people/customfields";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ defs: await listDefs(auth) });
});

const createSchema = z.object({
  label: z.string().min(2).max(80),
  type: z.enum(["text", "number", "date"]),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Label and type required", parsed.error.flatten());
    await createDef(auth, parsed.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  },
  { permission: "employees.edit" },
);
