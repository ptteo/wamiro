import { Content, PageHeader } from "@/components/page-header";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { listAdvances, myAdvances } from "@/modules/payroll/advances";

export const dynamic = "force-dynamic";
export const metadata = { title: "Salary Advances" };

export default async function AdvancesPage() {
  const ctx = await requireAuthPage();
  const canManage = can(ctx.access, "payroll.manage");
  const canViewSelf = can(ctx.access, "payroll.view_self");
  if (!canManage && !canViewSelf) {
    return (
      <Content>
        <Card>
          <EmptyState title="Advances unavailable" hint="You don't have access to the payroll module." />
        </Card>
      </Content>
    );
  }

  const advances = canManage ? await listAdvances(ctx) : await myAdvances(ctx);
  const { AdvancesClient } = await import("@/components/advances-client");

  return (
    <Content width="wide">
      <PageHeader
        title="Salary Advances"
        subtitle="Request an advance on your salary; approved advances are recovered from an upcoming payroll run."
      />
      <AdvancesClient
        data={{
          canManage,
          viewerId: ctx.user.id,
          advances: advances.map((a) => ({
            id: a.id,
            employeeUserId: a.employeeUserId,
            employeeName: a.employeeName,
            amount: a.amount,
            reason: a.reason,
            status: a.status,
            decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
            reviewNote: a.reviewNote,
            createdAt: a.createdAt.toISOString(),
          })),
        }}
      />
    </Content>
  );
}