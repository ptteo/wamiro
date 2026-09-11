import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { deleteEntitlement, listEntitlements, setEntitlement } from "@/modules/platform/entitlements";

/** Phase F — per-tenant entitlements editor (§3.4). */
export const GET = route(
  async (req, { auth }) => {
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) throw ApiError.badRequest("orgId required");
    return NextResponse.json({ entitlements: await listEntitlements(auth, orgId) });
  },
  { permission: "platform.admin" },
);

const postSchema = z.object({
  orgId: z.string().uuid(),
  key: z.string().min(1).max(120),
  value: z.string().min(1).max(120),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid request", parsed.error.flatten());
    await setEntitlement(auth, parsed.data.orgId, parsed.data.key, parsed.data.value);
    return NextResponse.json({ ok: true });
  },
  { permission: "platform.admin" },
);

const deleteSchema = z.object({ orgId: z.string().uuid(), key: z.string().min(1).max(120) });

export const DELETE = route(
  async (req: NextRequest, { auth }) => {
    const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid request", parsed.error.flatten());
    await deleteEntitlement(auth, parsed.data.orgId, parsed.data.key);
    return NextResponse.json({ ok: true });
  },
  { permission: "platform.admin" },
);
