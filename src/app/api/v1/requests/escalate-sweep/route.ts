import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { escalateOverdue } from "@/modules/requests/service";

/** R8 §32 — SLA escalation sweep (admin/cron triggerable; idempotent per request). */
export const POST = route(
  async (_req, { auth }) => {
    const escalated = await escalateOverdue(auth);
    return NextResponse.json({ ok: true, escalated });
  },
  { permission: "requests.manage" },
);
