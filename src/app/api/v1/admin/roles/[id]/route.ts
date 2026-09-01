import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { getRoleDetail } from "@/modules/admin/service";

export const GET = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("id required");
    return NextResponse.json({ role: await getRoleDetail(auth, id) });
  },
  { permission: "roles.manage" },
);
