/**
 * Goals & OKRs (blueprint Â§26 Work/Employee/Manager): company-transparent
 * goals with owner-driven progress. Anyone can view; only the owner
 * (or projects.manage holders) updates progress.
 */
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { goals, users } from "@/db/schema";
import { can } from "@/modules/iam/engine";

export interface GoalRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  progress: number;
  dueDate: string | null;
  ownerId: string;
  ownerName: string;
  createdAt: Date;
}

export async function listGoals(ctx: AuthContext, opts: { includeDone?: boolean } = {}): Promise<GoalRow[]> {
  const me = ctx.user.id;
  const whereParts = [eq(goals.organizationId, ctx.user.organizationId)];
  if (!opts.includeDone) whereParts.push(eq(goals.status, "active"));
  return db
    .select({
      id: goals.id,
      title: goals.title,
      description: goals.description,
      status: goals.status,
      progress: goals.progress,
      dueDate: goals.dueDate,
      ownerId: goals.ownerId,
      ownerName: users.name,
      createdAt: goals.createdAt,
    })
    .from(goals)
    .innerJoin(users, eq(users.id, goals.ownerId))
    .where(and(...whereParts))
    .orderBy(asc(goals.dueDate), asc(goals.title))
    .limit(200);
  // Suppress unused warning
  void me;
}

export async function createGoal(
  ctx: AuthContext,
  input: { title: string; description?: string | null; dueDate?: string | null },
) {
  const inserted = await db
    .insert(goals)
    .values({
      organizationId: ctx.user.organizationId,
      title: input.title.trim().slice(0, 200),
      description: input.description?.trim().slice(0, 2000) || null,
      ownerId: ctx.user.id,
      dueDate: input.dueDate || null,
    })
    .returning({ id: goals.id });
  const row = inserted[0];
  if (!row) throw new Error("Insert returned no row");

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "GOAL_CREATED",
    entityType: "goal",
    entityId: row.id,
    newValue: { title: input.title },
  });

  return row.id;
}

export async function updateProgress(ctx: AuthContext, goalId: string, progress: number) {
  if (progress < 0 || progress > 100) throw ApiError.badRequest("Progress must be 0â€“100");

  const [g] = await db
    .select({ id: goals.id, ownerId: goals.ownerId })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!g) throw ApiError.notFound();

  const isOwner = g.ownerId === ctx.user.id;
  if (!isOwner && !can(ctx.access, "goals.manage")) {
    throw ApiError.forbidden("Only the goal owner can update progress");
  }

  await db
    .update(goals)
    .set({
      progress,
      status: progress >= 100 ? "done" : "active",
    })
    .where(eq(goals.id, goalId));

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: progress >= 100 ? "GOAL_COMPLETED" : "GOAL_PROGRESS_UPDATED",
    entityType: "goal",
    entityId: goalId,
    newValue: { progress },
  });
}
