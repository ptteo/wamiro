/**
 * Optional sample work for first-run admins. Rows are tenant-scoped and
 * marked demo so they can be purged without touching real data.
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { can } from "@/modules/iam/engine";
import { projects, projectMembers, tasks, tickets } from "@/db/schema";

function assertSetupAdmin(ctx: AuthContext) {
  if (!can(ctx.access, "settings.manage") && !can(ctx.access, "users.manage")) {
    throw ApiError.forbidden("Only administrators can load sample data");
  }
}

export async function seedDemo(ctx: AuthContext): Promise<{ projects: number; tickets: number }> {
  assertSetupAdmin(ctx);
  const orgId = ctx.user.organizationId;
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.organizationId, orgId), eq(projects.demo, true)))
    .limit(1);
  if (existing[0]) return { projects: 0, tickets: 0 };

  const [proj] = await db
    .insert(projects)
    .values({
      organizationId: orgId,
      name: "Welcome project (sample)",
      description: "Sample work so you can see how projects and tasks look. Purge anytime from Setup.",
      createdBy: ctx.user.id,
      demo: true,
    })
    .returning({ id: projects.id });
  if (!proj) throw new Error("demo project insert failed");
  await db.insert(projectMembers).values({ projectId: proj.id, userId: ctx.user.id }).onConflictDoNothing();
  await db.insert(tasks).values([
    {
      organizationId: orgId,
      projectId: proj.id,
      title: "Invite your first teammates",
      description: "Sample task — delete with Purge sample data.",
      createdBy: ctx.user.id,
      assigneeId: ctx.user.id,
    },
    {
      organizationId: orgId,
      projectId: proj.id,
      title: "Walk the Home tour",
      description: "Open Home and follow the short product tour.",
      createdBy: ctx.user.id,
      assigneeId: ctx.user.id,
    },
  ]);

  await db.insert(tickets).values([
    {
      organizationId: orgId,
      title: "Laptop setup (sample)",
      description: "Sample ticket so Support is not empty. Safe to purge.",
      category: "hardware",
      requesterId: ctx.user.id,
      demo: true,
    },
    {
      organizationId: orgId,
      title: "Access to the shared drive (sample)",
      description: "Sample access request ticket.",
      category: "access",
      requesterId: ctx.user.id,
      demo: true,
    },
    {
      organizationId: orgId,
      title: "Welcome — how do I clock in? (sample)",
      description: "Sample how-to ticket. Real product help lives at /help.",
      category: "other",
      requesterId: ctx.user.id,
      demo: true,
    },
  ]);

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "DEMO_SEEDED",
    entityType: "organization",
    entityId: orgId,
  });
  return { projects: 1, tickets: 3 };
}

export async function purgeDemo(ctx: AuthContext): Promise<{ projects: number; tickets: number }> {
  assertSetupAdmin(ctx);
  const orgId = ctx.user.organizationId;
  const deadTickets = await db
    .delete(tickets)
    .where(and(eq(tickets.organizationId, orgId), eq(tickets.demo, true)))
    .returning({ id: tickets.id });
  const deadProjects = await db
    .delete(projects)
    .where(and(eq(projects.organizationId, orgId), eq(projects.demo, true)))
    .returning({ id: projects.id });
  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "DEMO_PURGED",
    entityType: "organization",
    entityId: orgId,
    newValue: { tickets: deadTickets.length, projects: deadProjects.length },
  });
  return { projects: deadProjects.length, tickets: deadTickets.length };
}

export async function demoStatus(ctx: AuthContext): Promise<{ loaded: boolean }> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.organizationId, ctx.user.organizationId), eq(projects.demo, true)))
    .limit(1);
  return { loaded: Boolean(row) };
}
