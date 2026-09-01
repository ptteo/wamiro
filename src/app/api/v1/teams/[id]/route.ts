import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { deleteTeam } from "@/modules/teams/service";

export const DELETE = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Team id required");
    await deleteTeam(auth, id);
    return NextResponse.json({ ok: true });
  },
  { permission: "teams.manage" },
);
