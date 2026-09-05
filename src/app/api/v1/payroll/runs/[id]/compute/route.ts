import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { computeRun } from "@/modules/payroll/service";

export const POST = route(async (_req, { auth, params }) => {
  const result = await computeRun(auth, params["id"] ?? "");
  return NextResponse.json(result);
});
