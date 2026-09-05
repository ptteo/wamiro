import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { myPayslips } from "@/modules/payroll/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ payslips: await myPayslips(auth) });
});
