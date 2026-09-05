import { Content, PageHeader } from "@/components/page-header";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import {
  listComponents,
  listPayrollMembers,
  listRuns,
  listStructures,
  myPayslips,
} from "@/modules/payroll/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payroll" };

export default async function PayrollPage() {
  const ctx = await requireAuthPage();
  const canManage = can(ctx.access, "payroll.manage");
  const canViewSelf = can(ctx.access, "payroll.view_self");
  if (!canManage && !canViewSelf) {
    return (
      <Content>
        <Card>
          <EmptyState title="Payroll unavailable" hint="You don't have access to the payroll module." />
        </Card>
      </Content>
    );
  }

  const [mine, components, structures, runs, members] = await Promise.all([
    myPayslips(ctx),
    canManage ? listComponents(ctx) : Promise.resolve([]),
    canManage ? listStructures(ctx) : Promise.resolve([]),
    canManage ? listRuns(ctx) : Promise.resolve([]),
    canManage ? listPayrollMembers(ctx) : Promise.resolve([]),
  ]);

  const { PayrollClient } = await import("@/components/payroll-client");

  return (
    <Content width="wide">
      <PageHeader
        title="Payroll"
        subtitle="Salary structures, monthly runs and payslips — everything stays inside Wamiro."
      />
      <PayrollClient
        data={{
          canManage,
          mine: mine.map((p) => ({
            id: p.id,
            runId: p.runId,
            periodLabel: p.periodLabel,
            periodStart: p.periodStart,
            periodEnd: p.periodEnd,
            runStatus: p.runStatus,
            earnings: p.earnings,
            deductions: p.deductions,
            gross: p.gross,
            totalDeductions: p.totalDeductions,
            net: p.net,
            currency: p.currency,
            locked: p.locked,
          })),
          components: components.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            amountType: c.amountType,
            defaultAmount: Number(c.defaultAmount),
            isTaxable: c.isTaxable,
            active: c.active,
          })),
          structures: structures.map((s) => ({
            id: s.id,
            employeeUserId: s.employeeUserId,
            employeeName: s.employeeName,
            name: s.name,
            base: s.base,
            currency: s.currency,
            effectiveFrom: String(s.effectiveFrom),
            status: s.status,
            lineCount: s.lineCount,
          })),
          runs: runs.map((r) => ({
            id: r.id,
            periodLabel: r.periodLabel,
            periodStart: r.periodStart,
            periodEnd: r.periodEnd,
            status: r.status,
            currency: r.currency,
            createdAt: r.createdAt.toISOString(),
            payslipCount: r.payslipCount,
            gross: r.gross,
            totalDeductions: r.totalDeductions,
            net: r.net,
          })),
          members: members.map((m) => ({ id: m.id, name: m.name, employeeCode: m.employeeCode })),
        }}
      />
    </Content>
  );
}
