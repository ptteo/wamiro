export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";

import { AddMemberForm } from "@/components/add-member-form";
import { FavoriteStar } from "@/components/favorite-star";
import { GanttChart } from "@/components/gantt";
import { KanbanBoard } from "@/components/kanban-board";
import { Avatar, Badge, Card, CardHeader } from "@/components/ui";
import { ProjectActivity } from "@/components/project-activity";
import { ProjectDetailTabs } from "@/components/project-detail-tabs";
import { ProjectMembersPanel } from "@/components/project-members-panel";
import { Content, PageHeader } from "@/components/page-header";
import { isFavorite } from "@/modules/favorites/service";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { getProjectDetail, projectTaskStats, setProjectStatus } from "@/modules/work/service";

export const metadata = { title: "Project" };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAuthPage();
  const { id } = await params;

  let detail;
  try {
    detail = await getProjectDetail(ctx, id);
  } catch {
    notFound();
  }
  const { project, members, tasks: projectTasks, activity } = detail;
  const starred = await isFavorite(ctx.user.id, "project", project.id);

  const open = projectTasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const done = projectTasks.filter((t) => t.status === "done" || t.status === "cancelled");
  const totalMinutes = projectTasks.reduce((s, t) => s + Number(t.loggedMinutes ?? 0), 0);
  const pct = projectTasks.length ? Math.round((done.length / projectTasks.length) * 100) : 0;
  const dueSoon = projectTasks.filter(
    (t) => t.dueDate && t.dueDate <= addDaysIso(new Date().toISOString().slice(0, 10), 3) && t.status !== "done" && t.status !== "cancelled",
  ).length;

  const canEdit = can(ctx.access, "projects.manage") || project.createdByName === ctx.user.name;

  return (
    <Content width="wide">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-tertiary">
        <Link href="/projects" className="inline-flex items-center gap-1 hover:text-primary">
          ← Projects
        </Link>
        <span aria-hidden>/</span>
        <span className="font-medium text-primary">{project.name}</span>
      </nav>

      {/* Thin header strip — the board is the page */}
      <header className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand-text">
            <FolderMark />
          </div>
          <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-primary">
            {project.name}
          </h1>
          <Badge tone={STATUS_TONE[project.status] ?? "neutral"}>
            {STATUS_LABEL[project.status] ?? project.status}
          </Badge>
          <FavoriteStar kind="project" refId={project.id} starred={starred} />

          {members.length > 0 ? (
            <ul className="hidden -space-x-1.5 sm:flex">
              {members.slice(0, 5).map((m) => (
                <li key={m.userId} title={m.name} className="inline-block">
                  <Avatar
                    name={m.name}
                    src={m.avatarUrl ?? undefined}
                    className="!h-7 !w-7 text-[10px] ring-2 ring-surface"
                  />
                </li>
              ))}
              {members.length > 5 ? (
                <li className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-subtle text-[10px] font-semibold text-tertiary ring-2 ring-surface">
                  +{members.length - 5}
                </li>
              ) : null}
            </ul>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
            <Link
              href={`/people/${project.createdBy ?? ""}`}
              className="text-tertiary hover:text-primary"
            >
              Lead · <span className="font-medium text-secondary">{project.createdByName ?? "—"}</span>
            </Link>
            <span className="text-disabled">·</span>
            <span className="text-tertiary">
              {done.length}/{projectTasks.length} done · {pct}%
            </span>
            {totalMinutes > 0 ? (
              <>
                <span className="text-disabled">·</span>
                <span className="text-tertiary">
                  {Math.floor(totalMinutes / 60)}h logged
                </span>
              </>
            ) : null}
            {canEdit && project.status !== "archived" ? (
              <StatusMenu projectId={project.id} current={project.status} />
            ) : null}
          </div>
        </div>
        {project.description ? (
          <p className="border-t border-border-subtle bg-surface-subtle/40 px-4 py-2.5 text-xs text-secondary">
            {project.description}
          </p>
        ) : null}
      </header>

      {/* Main work area: board OR timeline */}
      <ProjectDetailTabs
        tasks={projectTasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status as "todo" | "in_progress" | "done",
          priority: t.priority,
          dueDate: t.dueDate,
          assigneeName: t.assigneeName,
          loggedMinutes: Number(t.loggedMinutes ?? 0),
        }))}
        ganttTasks={projectTasks
          .filter((t): t is typeof t & { dueDate: string } => t.dueDate !== null)
          .map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            assigneeName: t.assigneeName,
            start: new Date(t.createdAt).toISOString().slice(0, 10),
            end: t.dueDate,
          }))}
      />

      {/* Right rail: activity + members + quick links */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title={`Activity (${activity.length})`}
              subtitle="Recent changes to this project"
            />
            <ProjectActivity
              items={activity.map((a) => ({
                id: a.id,
                action: a.action,
                actorName: a.actorName,
                createdAt: a.createdAt.toISOString(),
                newValue: a.newValue as Record<string, unknown> | null,
              }))}
            />
          </Card>
        </div>

        <div className="space-y-5">
          <ProjectMembersPanel members={members} canEdit={canEdit} projectId={project.id} />
          <Card>
            <CardHeader title="Quick links" />
            <ul className="divide-y divide-border-subtle text-sm">
              <li>
                <Link
                  href="/my-work"
                  className="flex items-center justify-between px-4 py-2.5 transition hover:bg-surface-hover"
                >
                  <span className="text-secondary">Your tasks across all projects</span>
                  <span className="text-tertiary">→</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/approvals"
                  className="flex items-center justify-between px-4 py-2.5 transition hover:bg-surface-hover"
                >
                  <span className="text-secondary">Approvals queue</span>
                  <span className="text-tertiary">→</span>
                </Link>
              </li>
              <li>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-center justify-between px-4 py-2.5 transition hover:bg-surface-hover"
                >
                  <span className="text-secondary">Open in new tab</span>
                  <span className="text-tertiary">→</span>
                </Link>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </Content>
  );
}

const STATUS_TONE: Record<string, "neutral" | "success" | "amber" | "brand" | "tertiary"> = {
  active: "success",
  completed: "neutral",
  archived: "tertiary",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function FolderMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

function StatusMenu({ projectId, current }: { projectId: string; current: string }) {
  return (
    <select
      aria-label="Project status"
      defaultValue={current}
      onChange={async (e) => {
        const v = e.target.value as "active" | "completed" | "archived";
        await fetch(`/api/v1/projects/${projectId}/status`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: v }),
        }).catch(() => {});
        // Full reload is simpler than wiring a router.refresh + state sync
        window.location.reload();
      }}
      className="rounded-md border border-border-default bg-surface px-2 py-1 text-xs text-primary focus:border-brand focus:outline-none"
    >
      <option value="active">Active</option>
      <option value="completed">Completed</option>
      <option value="archived">Archived</option>
    </select>
  );
}
