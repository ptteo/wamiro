import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createTeam, listTeams } from "@/modules/teams/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ teams: await listTeams(auth) });
});

const createSchema = z.object({ name: z.string().min(2).max(80) });

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Team name required", parsed.error.flatten());
    const row = await createTeam(auth, parsed.data.name);
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  },
  { permission: "teams.manage" },
);
