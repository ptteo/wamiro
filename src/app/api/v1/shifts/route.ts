import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { can } from "@/modules/iam/engine";
import { listMembers, myShifts, roster } from "@/modules/shifts/service";

export const GET = route(async (req: NextRequest, { auth }) => {
  const sp = req.nextUrl.searchParams;
  if (sp.get("roster") === "1") {
    // Full-org roster for a date range — shifts.manage only (enforced in service)
    const from = sp.get("from");
    const to = sp.get("to");
    if (!from || !to) {
      return NextResponse.json({ error: { code: "bad_request", message: "from and to are required" } }, { status: 400 });
    }
    return NextResponse.json({ assignments: await roster(auth, from, to) });
  }
  if (sp.get("members") === "1") {
    return NextResponse.json({ members: await listMembers(auth) });
  }
  const days = Math.min(90, Math.max(1, Number(sp.get("days") ?? 28) || 28));
  return NextResponse.json({
    shifts: await myShifts(auth, days),
    canManage: can(auth.access, "shifts.manage"),
  });
});
