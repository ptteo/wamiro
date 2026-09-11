import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { remove, update } from "@/modules/knowledge/service";

const updateSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(3).max(50_000),
  tags: z.array(z.string().min(1).max(30)).max(8).optional(),
  visibility: z.enum(["company", "department", "draft"]).optional(),
  departmentId: z.string().uuid().nullable().optional(),
});

export const PUT = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Article id required");
    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Title and body required", parsed.error.flatten());
    await update(auth, id, parsed.data);
    return NextResponse.json({ ok: true });
  },
  { permission: "knowledge.manage" },
);

export const DELETE = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Article id required");
    await remove(auth, id);
    return NextResponse.json({ ok: true });
  },
  { permission: "knowledge.manage" },
);
