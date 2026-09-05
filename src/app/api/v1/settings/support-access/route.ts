import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import {
  grantImpersonation,
  myImpersonationGrant,
  revokeImpersonation,
} from "@/modules/platform/console";

/** Phase E.2 (tenant side) — view the tenant's live support-access grant. */
export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ grant: await myImpersonationGrant(auth) });
});

const postSchema = z.object({
  reason: z.string().min(5).max(500),
  days: z.number().int().min(1).max(7).optional(),
  operatorLabel: z.string().max(120).optional(),
});

/** Tenant admin grants platform support a time-boxed impersonation window. */
export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid consent request", parsed.error.flatten());
    const grant = await grantImpersonation(auth, parsed.data);
    return NextResponse.json({ ok: true, expiresAt: grant.expiresAt.toISOString() }, { status: 201 });
  },
  { permission: "users.manage" },
);

/** Tenant admin revokes consent (live impersonation sessions end immediately). */
export const DELETE = route(
  async (req: NextRequest, { auth }) => {
    const grantId = req.nextUrl.searchParams.get("id") ?? "";
    if (!grantId) throw ApiError.badRequest("id required");
    await revokeImpersonation(auth, grantId);
    return NextResponse.json({ ok: true });
  },
  { permission: "users.manage" },
);
