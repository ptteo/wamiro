import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { getPayslip } from "@/modules/payroll/service";

export const GET = route(async (_req, { auth, params }) => {
  return NextResponse.json(await getPayslip(auth, params["id"] ?? ""));
});
