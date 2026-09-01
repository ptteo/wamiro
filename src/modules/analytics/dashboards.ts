import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { dashboardWidgets } from "@/db/schema";
import type { AuthContext } from "@/lib/session";
import { overview, type Overview } from "./service";

export interface PinnedMetric {
  metricId: string;
  label: string;
  value: number;
}

const LABELS: Record<string, string> = {
  headcount: "Headcount",
  on_leave_today: "On leave today",
  pending_approvals: "Pending approvals",
  approval_latency_hours: "Avg approval (h)",
};

export async function pinnedMetrics(
  ctx: AuthContext,
): Promise<{ pinned: PinnedMetric[]; available: Overview | null }> {
  const data = await overview(ctx);
  if (!data) return { pinned: [], available: null };

  const rows = await db
    .select({ metricId: dashboardWidgets.metricId })
    .from(dashboardWidgets)
    .where(and(eq(dashboardWidgets.userId, ctx.user.id)));

  const values: Record<string, number> = {
    headcount: data.headcount,
    on_leave_today: data.onLeaveToday,
    pending_approvals: data.pendingApprovals,
    approval_latency_hours: data.approvalLatencyHours,
  };

  return {
    pinned: rows.map((r) => ({
      metricId: r.metricId,
      label: LABELS[r.metricId] ?? r.metricId,
      value: values[r.metricId] ?? 0,
    })),
    available: data,
  };
}

export type { Overview };
