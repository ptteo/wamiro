import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { deleteRun, runDetail } from "@/modules/payroll/service";

export const GET = route(async (_req, { auth, params }) => {
  return NextResponse.json(await runDetail(auth, params["id"] ?? ""));
});

export const DELETE = route(async (_req, { auth, params }) => {
  await deleteRun(auth, params["id"] ?? "");
  return NextResponse.json({ ok: true });
});
