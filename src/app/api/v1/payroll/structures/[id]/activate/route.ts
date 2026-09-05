import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { activateStructure } from "@/modules/payroll/service";

export const POST = route(async (_req, { auth, params }) => {
  const row = await activateStructure(auth, params["id"] ?? "");
  return NextResponse.json({ ok: true, id: row.id });
});
