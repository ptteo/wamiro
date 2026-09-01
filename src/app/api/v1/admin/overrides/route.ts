import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { addOverride, removeOverride } from "@/modules/admin/service";

const addSchema = z.object({
  userId: z.string().uuid(),
  permission: z.string().min(3).max(80),
  effect: z.enum(["allow", "deny"]),
  scope: z.enum(["SELF", "TEAM", "DEPARTMENT", "COMPANY", "GLOBAL"]),
  expiresAt: z.string().datetime().nullable().optional(),
  reason: z.string().min(3).max(300),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = addSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid override", parsed.error.flatten());
    await addOverride(auth, {
      userId: parsed.data.userId,
      permission: parsed.data.permission,
      effect: parsed.data.effect,
      scope: parsed.data.scope,
      expiresAt: parsed.data.expiresAt ?? null,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  },
  { permission: "roles.manage" },
);

export const DELETE = route(
  async (req: NextRequest, { auth }) => {
    const body = (await req.json().catch(() => null)) as { overrideId?: string } | null;
    if (!body?.overrideId || !/^[0-9a-f-]{36}$/i.test(body.overrideId)) {
      throw ApiError.badRequest("overrideId required");
    }
    await removeOverride(auth, body.overrideId);
    return NextResponse.json({ ok: true });
  },
  { permission: "roles.manage" },
);
