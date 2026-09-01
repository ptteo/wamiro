import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { listRolesWithCounts } from "@/modules/admin/service";

export const GET = route(
  async (_req, { auth }) => {
    return NextResponse.json({ roles: await listRolesWithCounts(auth) });
  },
  { permission: "roles.manage" },
);
