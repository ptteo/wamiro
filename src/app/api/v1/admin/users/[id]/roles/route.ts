import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { assignRole, removeRole } from "@/modules/admin/service";

const bodySchema = z.object({ roleId: z.string().uuid() });

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Missing user id");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("roleId required");
    await assignRole(auth, id, parsed.data.roleId);
    return NextResponse.json({ ok: true });
  },
  { permission: "roles.manage" },
);

export const DELETE = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Missing user id");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("roleId required");
    await removeRole(auth, id, parsed.data.roleId);
    return NextResponse.json({ ok: true });
  },
  { permission: "roles.manage" },
);
