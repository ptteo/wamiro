export const dynamic = "force-dynamic";

import { Content, PageHeader } from "@/components/page-header";
import { WorkClient, type WorkData } from "@/components/work-client";
import { requireAuthPage } from "@/lib/page-auth";
import { can, widestScope } from "@/modules/iam/engine";
import {
  listMyTasks,
  listTeamTasks,
  listProjects,
  loggedMinutesByTask,
} from "@/modules/work/service";

export const metadata = { title: "My Work" };

export default async function MyWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; p?: string; s?: string }>;
}) {
  const ctx = await requireAuthPage();
  const sp = await searchParams;
  const showTeam = can(ctx.access, "tasks.view_team");

  const [mine, team, projects] = await Promise.all([
    listMyTasks(ctx),
    showTeam ? listTeamTasks(ctx) : Promise.resolve([]),
    listProjects(ctx),
  ]);

  // Build a map of taskId -> logged minutes
  const allTaskIds = [...mine.map((t) => t.id), ...team.map((t) => t.id)];
  const minutesMap = await loggedMinutesByTask(allTaskIds);
  const minutesOf = (id: string) => minutesMap.get(id) ?? 0;

  const data: WorkData = {
    tasks: mine.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      projectId: null, // listMyTasks doesn't return it; could add later
      projectName: t.projectName,
      assigneeId: t.assigneeId,
      assigneeName: t.assigneeName,
      loggedMinutes: minutesOf(t.id),
    })),
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    teamTasks: team.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      projectId: null,
      projectName: t.projectName,
      assigneeId: t.assigneeId,
      assigneeName: t.assigneeName,
      loggedMinutes: minutesOf(t.id),
    })),
  };

  return (
    <Content width="wide">
      <PageHeader
        title="My Work"
        subtitle="Your tasks across all projects — the single to-do list for your day."
      />
      <WorkClient data={data} canCreate={can(ctx.access, "tasks.create")} />
    </Content>
  );
}
