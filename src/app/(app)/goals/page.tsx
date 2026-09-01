import { Card, EmptyState } from "@/components/ui";
import { GoalsListClient, type GoalClientRow } from "@/components/goals-list";
import { Content, PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";
import { listGoals } from "@/modules/goals/service";

export const dynamic = "force-dynamic";

export const metadata = { title: "Goals" };

export default async function GoalsPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "goals")) {
    return (
      <Content width="standard">
        <Card>
          <EmptyState
            title="Goals unavailable"
            hint="This module is disabled for your organization."
          />
        </Card>
      </Content>
    );
  }

  const goals = await listGoals(ctx, { includeDone: true });
  const canManage = can(ctx.access, "goals.manage");

  const rows: GoalClientRow[] = goals.map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    status: g.status as GoalClientRow["status"],
    progress: g.progress,
    dueDate: g.dueDate,
    ownerId: g.ownerId,
    ownerName: g.ownerName,
    createdAt: g.createdAt.toISOString(),
    mine: g.ownerId === ctx.user.id,
    canManage,
  }));

  return (
    <Content width="wide">
      <PageHeader
        title="Goals"
        subtitle="Company objectives and OKRs — track progress against the targets that matter."
      />
      <GoalsListClient goals={rows} canCreate={true} />
    </Content>
  );
}
