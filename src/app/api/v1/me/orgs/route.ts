import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { tokenFromRequest } from "@/lib/session";
import { listMemberships, switchMembership } from "@/lib/session";

export const GET = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json({ organizations: await listMemberships(auth.user.id) });
  },
  { auth: true },
);

const schema = z.object({ organizationId: z.string().uuid() });

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("organizationId required");
    const token = tokenFromRequest(req);
    if (!token) throw ApiError.unauthorized();
    const ok = await switchMembership(token, auth.user.id, parsed.data.organizationId);
    if (!ok) throw ApiError.forbidden("No active membership in that organization");
    // §11: client must fully refresh — roles/modules/data all change with tenant.
    return NextResponse.json({ ok: true, refresh: true });
  },
  { auth: true },
);
