import { Content, PageHeader } from "@/components/page-header";
import { LeaveClient, type LeaveData } from "@/components/leave-client";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import {
  listLeaveTypes,
  myBalances,
  myRequests,
  pendingForApprover,
  teamOutNextWeeks,
} from "@/modules/leave/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leave" };

export default async function LeavePage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "leave.view_self")) {
    return (
      <Content>
        <Card>
          <EmptyState
            title="Leave unavailable"
            hint="You don't have access to the leave module."
          />
        </Card>
      </Content>
    );
  }

  const [balances, requests, types, approvals, teamOut] = await Promise.all([
    myBalances(ctx),
    myRequests(ctx),
    listLeaveTypes(ctx),
    can(ctx.access, "leave.approve") ? pendingForApprover(ctx) : Promise.resolve([]),
    teamOutNextWeeks(ctx, 8),
  ]);

  const data: LeaveData = {
    balances: balances.map((b) => ({
      leaveTypeId: b.leaveTypeId,
      name: b.name,
      annualQuotaDays: Number(b.annualQuotaDays),
      paid: b.paid,
      entitledDays: Number(b.entitledDays),
      usedDays: Number(b.usedDays),
    })),
    requests: requests.map((r) => ({
      id: r.id,
      typeName: r.typeName,
      startDate: String(r.startDate),
      endDate: String(r.endDate),
      days: Number(r.days),
      status: r.status,
      reason: r.reason ?? null,
      reviewNote: r.reviewNote ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    types: types.map((t) => ({ id: t.id, name: t.name })),
    approvals: approvals.map((a) => ({
      id: a.id,
      userId: a.userId,
      userName: a.userName,
      jobTitle: a.jobTitle ?? null,
      departmentName: a.departmentName ?? null,
      typeName: a.typeName,
      startDate: String(a.startDate),
      endDate: String(a.endDate),
      days: Number(a.days),
      reason: a.reason ?? null,
    })),
    teamOut: teamOut.map((t) => ({
      id: t.id,
      userId: t.userId,
      userName: t.userName,
      typeName: t.typeName,
      startDate: String(t.startDate),
      endDate: String(t.endDate),
      days: Number(t.days),
    })),
  };

  return (
    <Content width="wide">
      <PageHeader
        title="Leave"
        subtitle="Your time off — balances, requests, and what's coming up across the team."
      />
      <LeaveClient data={data} canApply={can(ctx.access, "leave.apply")} />
    </Content>
  );
}
