import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createTouchpoint, listTouchpoints, TOUCHPOINT_KINDS } from "@/modules/platform/crm";

/** Phase C — CRM-lite touchpoints for a tenant (platform schema, operator-only). */
export const GET = route(
  async (_req, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Organization id required");
    return NextResponse.json({ touchpoints: await listTouchpoints(auth, id) });
  },
  { permission: "platform.admin" },
);

const createSchema = z.object({
  kind: z.enum(TOUCHPOINT_KINDS),
  summary: z.string().trim().min(2).max(2000),
  occurredAt: z.string().datetime().nullable().optional(),
});

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Organization id required");
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid touchpoint", parsed.error.flatten());
    const row = await createTouchpoint(auth, id, parsed.data);
    return NextResponse.json({ ok: true, touchpoint: row }, { status: 201 });
  },
  { permission: "platform.admin" },
);
