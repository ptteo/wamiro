import { Content, PageHeader } from "@/components/page-header";
import { LeaveClient, type LeaveData } from "@/components/leave-client";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { asIsoDate, buildTeamWeeks, fmtUtcRange, utcDate } from "@/modules/leave/dates";
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

  const todayIso = utcDate();
  const trips = teamOut.map((t) => ({
    id: t.id,
    userId: t.userId,
    userName: t.userName,
    typeName: t.typeName,
    startDate: asIsoDate(t.startDate),
    endDate: asIsoDate(t.endDate),
    days: Number(t.days),
  }));
  const data: LeaveData = {
    balances: balances.map((b) => ({
      leaveTypeId: b.leaveTypeId,
      name: b.name,
      annualQuotaDays: Number(b.annualQuotaDays),
      paid: b.paid,
      entitledDays: Number(b.entitledDays),
      usedDays: Number(b.usedDays),
    })),
    requests: requests.map((r) => {
      const startDate = asIsoDate(r.startDate);
      const endDate = asIsoDate(r.endDate);
      return {
        id: r.id,
        typeName: r.typeName,
        startDate,
        endDate,
        days: Number(r.days),
        rangeLabel: fmtUtcRange(startDate, endDate),
        status: r.status,
        reason: r.reason ?? null,
        reviewNote: r.reviewNote ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    }),
    types: types.map((t) => ({ id: t.id, name: t.name })),
    approvals: approvals.map((a) => {
      const startDate = asIsoDate(a.startDate);
      const endDate = asIsoDate(a.endDate);
      return {
        id: a.id,
        userId: a.userId,
        userName: a.userName,
        jobTitle: a.jobTitle ?? null,
        departmentName: a.departmentName ?? null,
        typeName: a.typeName,
        startDate,
        endDate,
        days: Number(a.days),
        rangeLabel: fmtUtcRange(startDate, endDate),
        reason: a.reason ?? null,
        kind: a.kind,
      };
    }),
    teamOut: trips,
    teamWeeks: buildTeamWeeks(trips, todayIso),
  };

  return (
    <Content width="wide">
      <PageHeader
        title="Leave"
        subtitle="Your time off — balances, requests, and what's coming up across the team."
      />
      <LeaveClient
        data={data}
        todayIso={todayIso}
        canApply={can(ctx.access, "leave.apply")}
        canApprove={can(ctx.access, "leave.approve")}
      />
    </Content>
  );
}
