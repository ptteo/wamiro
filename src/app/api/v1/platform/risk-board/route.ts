import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { tenantRiskBoard } from "@/modules/platform/console";

/** Phase E.1 — cohort/activation/churn board for the platform console. */
export const GET = route(
  async (_req, { auth }) => {
    return NextResponse.json({ tenants: await tenantRiskBoard(auth) });
  },
  { permission: "platform.admin" },
);
