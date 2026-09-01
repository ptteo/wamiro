import { Content, PageHeader } from "@/components/page-header";
import { TeamsClient } from "@/components/teams-client";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listTeams } from "@/modules/teams/service";

export const dynamic = "force-dynamic";

export const metadata = { title: "Teams" };

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await requireAuthPage();
  if (
    !isModuleEnabled(ctx.org.modules, "teams") ||
    !can(ctx.access, "employees.view")
  ) {
    return (
      <Content>
        <Card>
          <EmptyState title="Teams unavailable" hint="You don't have access to the team directory." />
        </Card>
      </Content>
    );
  }

  const sp = await searchParams;
  const teams = await listTeams(ctx);

  return (
    <Content width="wide">
      <PageHeader
        title="Teams"
        subtitle="Cross-department groups of people working together."
      />
      <TeamsClient
        teams={teams as never}
        canManage={can(ctx.access, "teams.manage")}
      />
    </Content>
  );
}
