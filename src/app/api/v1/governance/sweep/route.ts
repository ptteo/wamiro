import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { escalateOverdueObligations } from "@/modules/governance/service";

/** D15 — overdue compliance obligations sweep (admin/cron triggerable; idempotent). */
export const POST = route(
  async (_req, { auth }) => {
    const escalated = await escalateOverdueObligations(auth);
    return NextResponse.json({ ok: true, escalated });
  },
  { permission: "governance.manage" },
);
