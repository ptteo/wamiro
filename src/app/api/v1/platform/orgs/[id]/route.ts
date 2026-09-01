import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { listTenants, setTenantStatus } from "@/modules/platform/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ tenants: await listTenants(auth) });
});

const patchSchema = z.object({ status: z.enum(["active", "suspended"]) });

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Organization id required");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("status must be active|suspended");
    await setTenantStatus(auth, id, parsed.data.status);
    return NextResponse.json({ ok: true });
  },
  { permission: "platform.admin" },
);
