import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { deactivateComponent } from "@/modules/payroll/service";

export const DELETE = route(async (_req, { auth, params }) => {
  await deactivateComponent(auth, params["id"] ?? "");
  return NextResponse.json({ ok: true });
});
