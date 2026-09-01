export const dynamic = "force-dynamic";

import { ProjectsListClient } from "@/components/projects-list";
import { Card, EmptyState } from "@/components/ui";
import { Content, PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { listProjects } from "@/modules/work/service";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "projects.view")) {
    return (
      <Content>
        <Card>
          <EmptyState title="Projects unavailable" hint="You don't have access to projects." />
        </Card>
      </Content>
    );
  }

  const projects = await listProjects(ctx);

  return (
    <Content width="wide">
      <PageHeader
        title="Projects"
        subtitle="Active workstreams across the company. Pick a project to see its board, timeline, and members."
      />
      <ProjectsListClient
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          status: p.status,
          openTasks: p.openTasks,
          doneTasks: p.doneTasks,
          totalTasks: p.totalTasks,
          memberCount: p.memberCount,
          totalMinutes: p.totalMinutes,
          ownerName: p.ownerName,
          createdAt: p.createdAt.toISOString(),
          isMember: p.isMember,
          members: p.members,
        }))}
        canCreate={can(ctx.access, "projects.create") || can(ctx.access, "projects.manage")}
      />
    </Content>
  );
}
