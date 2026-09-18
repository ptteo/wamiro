/**
 * Work module: projects + tasks (blueprint "My Work").
 * Wamiro-owned in v1; the service functions are the adapter seam for an
 * OpenProject integration later — UI never talks to a vendor directly.
 *
 * Visibility rules:
 *  - personal tasks: assignee sees own; managers see reports' tasks (TEAM)
 *  - project tasks: project members + anyone with projects.view (directory-level
 *    awareness) but mutation limited to members/creators/manage
 */
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertDateInBounds } from "@/lib/date-bounds";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { notify } from "@/modules/notifications/service";
import {
  auditLogs,
  employees,
  projectMembers,
  projects,
  tasks,
  timeLogs,
  users,
} from "@/db/schema";
import { can } from "@/modules/iam/engine";

const STATUSES = new Set(["backlog", "todo", "in_progress", "blocked", "done", "cancelled"]);
const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

// ---------- helpers ----------

async function assertProjectInOrg(orgId: string, projectId: string | null): Promise<string | null> {
  if (!projectId) return null;
  const [p] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)))
    .limit(1);
  if (!p) throw ApiError.notFound("Project not found");
  return p.id;
}

/** Can viewer edit this task? Assignee, creator, project member/creator, or projects.manage. */
async function canMutateTask(
  ctx: AuthContext,
  t: { assigneeId: string; createdBy: string; projectId: string | null },
): Promise<boolean> {
  if (can(ctx.access, "projects.manage")) return true;
  if (t.assigneeId === ctx.user.id || t.createdBy === ctx.user.id) return true;
  if (t.projectId) {
    const [m] = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(
        and(eq(projectMembers.projectId, t.projectId), eq(projectMembers.userId, ctx.user.id)),
      )
      .limit(1);
    return !!m;
  }
  return false;
}

// ---------- tasks ----------

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  projectName: string | null;
  assigneeName: string;
  assigneeId: string;
}

export async function listMyTasks(ctx: AuthContext): Promise<TaskRow[]> {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      projectName: projects.name,
      assigneeName: users.name,
      assigneeId: tasks.assigneeId,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(users, eq(users.id, tasks.assigneeId))
    .where(
      and(eq(tasks.organizationId, ctx.user.organizationId), eq(tasks.assigneeId, ctx.user.id)),
    )
    .orderBy(asc(tasks.status), asc(tasks.dueDate))
    .limit(200);
  return rows;
}

/** TEAM scope: direct reports' open tasks (+ own). */
export async function listTeamTasks(ctx: AuthContext): Promise<TaskRow[]> {
  if (!can(ctx.access, "tasks.view_team")) return [];
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      projectName: projects.name,
      assigneeName: users.name,
      assigneeId: tasks.assigneeId,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(users, eq(users.id, tasks.assigneeId))
    .where(
      and(
        eq(tasks.organizationId, ctx.user.organizationId),
        ne(tasks.status, "done"),
        sql`(${tasks.assigneeId} = ${ctx.user.id} OR ${tasks.assigneeId} IN (
          SELECT user_id FROM employees WHERE manager_user_id = ${ctx.user.id}
        ))`,
      ),
    )
    .orderBy(desc(tasks.priority), asc(tasks.dueDate))
    .limit(100);
  return rows;
}

export async function createTask(
  ctx: AuthContext,
  input: {
    title: string;
    description?: string | null;
    projectId?: string | null;
    assigneeId?: string | null;
    priority?: string;
    dueDate?: string | null;
  },
) {
  if (!can(ctx.access, "tasks.create")) {
    throw ApiError.forbidden("Missing permission: tasks.create");
  }
  const orgId = ctx.user.organizationId;

  // assignment: self by default; others must be direct reports or share a project
  let assigneeId = ctx.user.id;
  if (input.assigneeId && input.assigneeId !== ctx.user.id) {
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, input.assigneeId), eq(users.organizationId, orgId)))
      .limit(1);
    if (!target) throw ApiError.notFound("Assignee not found");
    const [isReport] = await db
      .select({ id: employees.userId })
      .from(employees)
      .where(and(eq(employees.userId, input.assigneeId), eq(employees.managerUserId, ctx.user.id)))
      .limit(1);
    if (!isReport && !input.projectId) {
      throw ApiError.forbidden("You can only assign personal tasks to yourself or your direct reports");
    }
    assigneeId = input.assigneeId;
  }

  const projectId = await assertProjectInOrg(orgId, input.projectId ?? null);
  const priority = PRIORITIES.has(input.priority ?? "") ? input.priority! : "medium";

  const inserted = await db
    .insert(tasks)
    .values({
      organizationId: orgId,
      projectId,
      title: input.title.trim().slice(0, 300),
      description: input.description?.trim().slice(0, 5000) || null,
      assigneeId,
      priority,
      dueDate: input.dueDate || null,
      createdBy: ctx.user.id,
    })
    .returning({ id: tasks.id });
  const row = inserted[0];
  if (!row) throw new Error("Insert returned no row");

  if (assigneeId !== ctx.user.id) {
    await notify({
      organizationId: orgId,
      userId: assigneeId,
      type: "task.assigned",
      title: `${ctx.user.name} assigned you a task`,
      body: input.title,
      link: "/my-work",
    });
  }

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "TASK_CREATED",
    entityType: "task",
    entityId: row.id,
    newValue: { title: input.title },
  });
  return row;
}

export async function updateTaskStatus(ctx: AuthContext, taskId: string, status: string) {
  if (!STATUSES.has(status)) throw ApiError.badRequest("Invalid status");
  const [t] = await db
    .select({
      id: tasks.id,
      assigneeId: tasks.assigneeId,
      createdBy: tasks.createdBy,
      projectId: tasks.projectId,
      status: tasks.status,
    })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!t) throw ApiError.notFound();
  if (!(await canMutateTask(ctx, t))) throw ApiError.forbidden();

  await db
    .update(tasks)
    .set({ status, completedAt: status === "done" ? new Date() : null })
    .where(eq(tasks.id, taskId));

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: status === "done" ? "TASK_COMPLETED" : "TASK_UPDATED",
    entityType: "task",
    entityId: taskId,
    newValue: { status },
  });
}

// ---------- projects ----------

export interface ProjectListEntry {
  id: string;
  name: string;
  description: string | null;
  status: string;
  openTasks: number;
  doneTasks: number;
  totalTasks: number;
  memberCount: number;
  totalMinutes: number;
  ownerName: string | null;
  createdAt: Date;
  isMember: boolean;
  members: { userId: string; name: string; avatarUrl: string | null }[];
}

export async function listProjects(ctx: AuthContext): Promise<ProjectListEntry[]> {
  const me = ctx.user.id;
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      status: projects.status,
      createdAt: projects.createdAt,
      ownerName: users.name,
      openTasks: sql<number>`(SELECT count(*)::int FROM tasks tk WHERE tk.project_id = ${projects.id} AND tk.status <> 'done')`,
      doneTasks: sql<number>`(SELECT count(*)::int FROM tasks tk WHERE tk.project_id = ${projects.id} AND tk.status = 'done')`,
      totalTasks: sql<number>`(SELECT count(*)::int FROM tasks tk WHERE tk.project_id = ${projects.id})`,
      memberCount: sql<number>`(SELECT count(*)::int FROM project_members pm WHERE pm.project_id = ${projects.id})`,
      totalMinutes: sql<number>`COALESCE((SELECT SUM(tl.minutes)::int FROM time_logs tl JOIN tasks tk ON tk.id = tl.task_id WHERE tk.project_id = ${projects.id}), 0)`,
      isMember: sql<boolean>`EXISTS (SELECT 1 FROM project_members pm2 WHERE pm2.project_id = ${projects.id} AND pm2.user_id = ${me})`,
    })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.createdBy))
    .where(
      and(
        eq(projects.organizationId, ctx.user.organizationId),
        eq(projects.status, "active"),
      ),
    )
    .orderBy(desc(projects.createdAt));

  // For each project, fetch the first 4 members for the avatar stack
  // in the card. One extra query but bounded by project count.
  const projectIds = rows.map((r) => r.id);
  const memberRows = projectIds.length === 0 ? [] : await db
    .select({
      projectId: projectMembers.projectId,
      userId: projectMembers.userId,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(sql`${projectMembers.projectId} = ANY(${`{${projectIds.join(",")}}`}::uuid[])`)
    .orderBy(projectMembers.projectId, users.name)
    .limit(1000);

  const membersByProject = new Map<string, { userId: string; name: string; avatarUrl: string | null }[]>();
  for (const m of memberRows as unknown as { projectId: string; userId: string; name: string; avatarUrl: string | null }[]) {
    const arr = membersByProject.get(m.projectId) ?? [];
    if (arr.length < 4) {
      arr.push({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl });
      membersByProject.set(m.projectId, arr);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status,
    createdAt: r.createdAt,
    ownerName: r.ownerName,
    openTasks: Number(r.openTasks),
    doneTasks: Number(r.doneTasks),
    totalTasks: Number(r.totalTasks),
    memberCount: Number(r.memberCount),
    totalMinutes: Number(r.totalMinutes),
    isMember: !!r.isMember,
    members: membersByProject.get(r.id) ?? [],
  }));
}

export async function createProject(
  ctx: AuthContext,
  input: { name: string; description?: string | null },
) {
  if (!can(ctx.access, "projects.create") && !can(ctx.access, "projects.manage")) {
    throw ApiError.forbidden("Missing permission: projects.create");
  }
  const inserted = await db
    .insert(projects)
    .values({
      organizationId: ctx.user.organizationId,
      name: input.name.trim().slice(0, 120),
      description: input.description?.trim().slice(0, 2000) || null,
      createdBy: ctx.user.id,
    })
    .returning({ id: projects.id });
  const row = inserted[0];
  if (!row) throw new Error("Insert returned no row");

  // creator joins automatically
  await db.insert(projectMembers).values({ projectId: row.id, userId: ctx.user.id }).onConflictDoNothing();

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "PROJECT_CREATED",
    entityType: "project",
    entityId: row.id,
    newValue: { name: input.name },
  });
  return row;
}

export async function getProjectDetail(ctx: AuthContext, projectId: string) {
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      status: projects.status,
      createdAt: projects.createdAt,
      createdBy: projects.createdBy,
      createdByName: users.name,
    })
    .from(projects)
    .innerJoin(users, eq(users.id, projects.createdBy))
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!project) throw ApiError.notFound();

  const members = await db
    .select({
      userId: projectMembers.userId,
      name: users.name,
      avatarUrl: users.avatarUrl,
      jobTitle: employees.jobTitle,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .leftJoin(employees, eq(employees.userId, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId));

  const projectTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      assigneeName: users.name,
      assigneeId: tasks.assigneeId,
      createdAt: tasks.createdAt,
      loggedMinutes: sql<number>`COALESCE((SELECT SUM(tl.minutes)::int FROM time_logs tl WHERE tl.task_id = ${tasks.id}), 0)`,
    })
    .from(tasks)
    .innerJoin(users, eq(users.id, tasks.assigneeId))
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.status), asc(tasks.dueDate))
    .limit(300);

  // Activity feed — last 20 events tied to this project. We match by
  // entityType='project' with entityId=projectId OR entityType='task'
  // whose taskId is in this project's tasks. To keep it simple, we
  // surface project-level events and any task events by joining the
  // tasks table. Activity is the user's life of the project.
  const taskIds = projectTasks.map((t) => t.id);
  const activity = taskIds.length === 0
    ? await db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          actorName: users.name,
          createdAt: auditLogs.createdAt,
          newValue: auditLogs.newValue,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorUserId))
        .where(
          and(
            eq(auditLogs.organizationId, ctx.user.organizationId),
            eq(auditLogs.entityType, "project"),
            eq(auditLogs.entityId, projectId),
          ),
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(20)
    : await db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          actorName: users.name,
          createdAt: auditLogs.createdAt,
          newValue: auditLogs.newValue,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorUserId))
        .where(
          and(
            eq(auditLogs.organizationId, ctx.user.organizationId),
            sql`(${auditLogs.entityType} = 'project' AND ${auditLogs.entityId} = ${projectId})
              OR (${auditLogs.entityType} = 'task' AND ${auditLogs.entityId} = ANY(${`{${taskIds.join(",")}}`}::text[]))`,
          ),
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(20);

  return { project, members, tasks: projectTasks, activity };
}

export async function setProjectStatus(
  ctx: AuthContext,
  projectId: string,
  status: "active" | "completed" | "archived",
) {
  if (!can(ctx.access, "projects.manage")) {
    throw ApiError.forbidden("Missing permission: projects.manage");
  }
  const [row] = await db
    .update(projects)
    .set({ status })
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, ctx.user.organizationId)))
    .returning({ id: projects.id });
  if (!row) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "PROJECT_STATUS_CHANGED",
    entityType: "project",
    entityId: projectId,
    newValue: { status },
  });
}

export async function addProjectMember(
  ctx: AuthContext,
  projectId: string,
  userEmail: string,
) {
  const [p] = await db
    .select({ id: projects.id, createdBy: projects.createdBy })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!p) throw ApiError.notFound();
  if (
    p.createdBy !== ctx.user.id &&
    !can(ctx.access, "projects.manage")
  ) {
    throw ApiError.forbidden("Only the project creator or an administrator can add members");
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, userEmail.trim().toLowerCase()), eq(users.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!user) throw ApiError.notFound("No user with that email in your organization");

  await db.insert(projectMembers).values({ projectId, userId: user.id }).onConflictDoNothing();

  await notify({
    organizationId: ctx.user.organizationId,
    userId: user.id,
    type: "project.member_added",
    title: `You were added to a project`,
    link: `/projects/${projectId}`,
  });

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "PROJECT_MEMBER_ADDED",
    entityType: "project",
    entityId: projectId,
    metadata: { userId: user.id },
  });
}

// ---------- time tracking ----------

/** Log minutes against a task. Assignee or project members only. */
export async function logTime(
  ctx: AuthContext,
  taskId: string,
  input: { minutes: number; logDate?: string; note?: string | null },
) {
  const orgId = ctx.user.organizationId;
  const [t] = await db
    .select({
      id: tasks.id,
      assigneeId: tasks.assigneeId,
      createdBy: tasks.createdBy,
      projectId: tasks.projectId,
      title: tasks.title,
    })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.organizationId, orgId)))
    .limit(1);
  if (!t) throw ApiError.notFound();
  if (!(await canMutateTask(ctx, t))) {
    throw ApiError.forbidden("Only the assignee, creator or project members can log time");
  }
  if (input.minutes <= 0 || input.minutes > 24 * 60) {
    throw ApiError.badRequest("Minutes must be between 1 and 1440");
  }
  const logDate = /^\d{4}-\d{2}-\d{2}$/.test(input.logDate ?? "")
    ? assertDateInBounds(input.logDate!, "log date") // G-30 — reject far past/future/invalid dates
    : new Date().toISOString().slice(0, 10);

  const inserted = await db
    .insert(timeLogs)
    .values({
      organizationId: orgId,
      taskId,
      userId: ctx.user.id,
      logDate,
      minutes: Math.round(input.minutes),
      note: input.note?.slice(0, 300) || null,
    })
    .returning({ id: timeLogs.id });
  const row = inserted[0];
  if (!row) throw new Error("Insert returned no row");

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "TIME_LOGGED",
    entityType: "task",
    entityId: taskId,
    newValue: { minutes: input.minutes, date: logDate },
  });
}

/** Total logged minutes per task for a set of task ids. */
export async function loggedMinutesByTask(taskIds: string[]): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();
  // single bound param as a Postgres array literal — a raw JS array would be
  // flattened by drizzle into a tuple that cannot cast to uuid[]
  const idsLiteral = `{${taskIds.join(",")}}`;
  const rows = await db.execute(sql`
    SELECT task_id, SUM(minutes)::int AS total FROM time_logs
    WHERE task_id = ANY(${idsLiteral}::uuid[])
    GROUP BY task_id
  `);
  const map = new Map<string, number>();
  for (const r of rows.rows as unknown as { task_id: string; total: number }[]) {
    map.set(r.task_id, Number(r.total));
  }
  return map;
}


/** R-work: per-project task rollup for the project detail progress card. */
export async function projectTaskStats(ctx: AuthContext, projectId: string) {
  const rows = await db
    .select({ status: tasks.status })
    .from(tasks)
    .where(and(eq(tasks.organizationId, ctx.user.organizationId), eq(tasks.projectId, projectId)));
  const total = rows.length;
  const done = rows.filter((r) => r.status === "done" || r.status === "cancelled").length;
  const openByStatus: Record<string, number> = {};
  for (const r of rows) {
    if (r.status === "done" || r.status === "cancelled") continue;
    openByStatus[r.status] = (openByStatus[r.status] ?? 0) + 1;
  }
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0, openByStatus };
}