import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { inviteUser, listUsersWithRoles } from "@/modules/admin/service";

export const GET = route(
  async (_req, { auth }) => {
    return NextResponse.json({ users: await listUsersWithRoles(auth) });
  },
  { permission: "users.manage" },
);

const inviteSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(200),
  roleKey: z.string().min(2).max(50),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = inviteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
    const result = await inviteUser(auth, {
      ...parsed.data,
      // ponytail: ?legacy=1 keeps the temp-password email for one release
      legacy: req.nextUrl.searchParams.get("legacy") === "1",
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  },
  { permission: "users.manage" },
);
