import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { tenantOverview, tenantUsageTab, tenantBillingTab, tenantSupportTab, tenantAccessTab } from "@/modules/platform/tenant-360";
import { tenantTimeline } from "@/modules/platform/crm";

/** Phase C — Tenant 360: one response with every tab's read-model. */
export const GET = route(
  async (_req, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Organization id required");
    const [overview, usage, billing, support, access, timeline] = await Promise.all([
      tenantOverview(auth, id),
      tenantUsageTab(auth, id).catch(() => null),
      tenantBestEffort(() => tenantBillingTab(auth, id)),
      tenantBestEffort(() => tenantSupportTab(auth, id)),
      tenantBestEffort(() => tenantAccessTab(auth, id)),
      tenantBestEffort(() => tenantTimeline(auth, id, 100)),
    ]);
    return NextResponse.json({ overview, usage, billing, support, access, timeline });
  },
  { permission: "platform.admin" },
);

async function tenantBestEffort<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
