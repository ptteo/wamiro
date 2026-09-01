import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createDepartment, listDepartments } from "@/modules/org/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ departments: await listDepartments(auth) });
});

const createSchema = z.object({
  name: z.string().min(2).max(80),
  parentDepartmentId: z.string().uuid().nullish(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Department name required", parsed.error.flatten());
    const row = await createDepartment(auth, {
      name: parsed.data.name,
      parentDepartmentId: parsed.data.parentDepartmentId ?? null,
    });
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  },
  { permission: "departments.manage" },
);
