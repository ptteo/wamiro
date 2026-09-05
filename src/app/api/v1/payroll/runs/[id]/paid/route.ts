import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { markPaid } from "@/modules/payroll/service";

export const POST = route(async (_req, { auth, params }) => {
  await markPaid(auth, params["id"] ?? "");
  return NextResponse.json({ ok: true });
});
