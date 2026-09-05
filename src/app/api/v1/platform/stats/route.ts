import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { platformStats } from "@/modules/platform/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json(await platformStats(auth));
});