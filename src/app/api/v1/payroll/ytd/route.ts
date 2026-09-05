import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { yearToDate } from "@/modules/payroll/service";

export const GET = route(async (req: NextRequest, { auth }) => {
  const year = Number(req.nextUrl.searchParams.get("year") ?? new Date().getFullYear()) || new Date().getFullYear();
  return NextResponse.json({ year, rows: await yearToDate(auth, year) });
});
