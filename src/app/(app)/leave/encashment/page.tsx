import { Content, PageHeader } from "@/components/page-header";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { listLeaveTypes, myBalances } from "@/modules/leave/service";
import { mine, pendingForApprover } from "@/modules/leave/encashment";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leave encashment" };

export default async function EncashmentPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "leave.apply") && !can(ctx.access, "leave.approve")) {
    return (
      <Content>
        <Card>
          <EmptyState title="Encashment unavailable" hint="You don't have access to the leave module." />
        </Card>
      </Content>
    );
  }

  const canApprove = can(ctx.access, "leave.approve");
  const [mineRows, pending, types, balances] = await Promise.all([
    mine(ctx),
    canApprove ? pendingForApprover(ctx) : Promise.resolve([]),
    listLeaveTypes(ctx),
    myBalances(ctx),
  ]);

  const serialize = (rows: Awaited<ReturnType<typeof mine>>) =>
    rows.map((r) => ({
      id: r.id,
      userName: r.userName,
      leaveTypeName: r.leaveTypeName,
      days: r.days,
      reason: r.reason,
      status: r.status,
      rate: r.rate,
      amount: r.amount,
      decidedNote: r.decidedNote,
      createdAt: r.createdAt.toISOString(),
    }));

  const { EncashmentClient } = await import("@/components/encashment-client");

  return (
    <Content width="wide">
      <PageHeader
        title="Leave encashment"
        subtitle="Cash out unused paid leave — HR sets the per-day rate on approval."
      />
      <EncashmentClient
        data={{
          canApply: can(ctx.access, "leave.apply"),
          canApprove,
          mine: serialize(mineRows),
          pending: serialize(pending),
          types: types.map((t) => ({ id: t.id, name: t.name })),
          balances: balances.map((b) => ({
            leaveTypeId: b.leaveTypeId,
            name: b.name,
            remaining: Number(b.entitledDays) - Number(b.usedDays),
          })),
        }}
      />
    </Content>
  );
}
