import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { listTenants } from "@/modules/platform/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ tenants: await listTenants(auth) });
});
