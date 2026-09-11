/**
 * D13 — People ops / HR lifecycle service.
 * Reuses existing engines: IAM permissions, audit, notifications stay central.
 */
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import {
  candidateEvents,
  candidates,
  courseEnrollments,
  courses,
  employees,
  jobChanges,
  jobOpenings,
  journeyItems,
  journeys,
  profileChangeRequests,
  recognitions,
  reviewCycles,
  reviewEntries,
  users,
} from "@/db/schema";
import { can } from "@/modules/iam/engine";

export const STAGES = ["applied", "screen", "interview", "offer", "hired", "rejected"] as const;

// ---------- recruitment ----------

export async function listJobs(ctx: AuthContext) {
  return db
    .select({
      id: jobOpenings.id,
      title: jobOpenings.title,
      status: jobOpenings.status,
      location: jobOpenings.location,
      openings: jobOpenings.openings,
      managerName: users.name,
      departmentId: jobOpenings.departmentId,
    })
    .from(jobOpenings)
    .leftJoin(users, eq(users.id, jobOpenings.hiringManagerUserId))
    .where(eq(jobOpenings.organizationId, ctx.user.organizationId))
    .orderBy(desc(jobOpenings.openedAt))
    .limit(100);
}

export async function createJob(
  ctx: AuthContext,
  input: { title: string; departmentId?: string; location?: string; employmentType?: string; openings?: number; hiringManagerUserId?: string; description?: string },
) {
  if (!can(ctx.access, "recruitment.manage")) throw ApiError.forbidden();
  const [row] = await db
    .insert(jobOpenings)
    .values({
      organizationId: ctx.user.organizationId,
      title: input.title.slice(0, 200),
      departmentId: input.departmentId ?? null,
      location: input.location ?? null,
      employmentType: input.employmentType ?? null,
      openings: Math.min(Math.max(input.openings ?? 1, 1), 50),
      hiringManagerUserId: input.hiringManagerUserId ?? ctx.user.id,
      description: input.description ?? null,
    })
    .returning({ id: jobOpenings.id });
  return row!.id;
}

export async function closeJob(ctx: AuthContext, id: string) {
  if (!can(ctx.access, "recruitment.manage")) throw ApiError.forbidden();
  const updated = await db
    .update(jobOpenings)
    .set({ status: "closed", closedAt: new Date() })
    .where(and(eq(jobOpenings.id, id), eq(jobOpenings.organizationId, ctx.user.organizationId)))
    .returning({ id: jobOpenings.id });
  if (!updated[0]) throw ApiError.notFound();
}

export async function listCandidates(ctx: AuthContext, opts: { stage?: string; openingId?: string } = {}) {
  const conds = [eq(candidates.organizationId, ctx.user.organizationId)];
  if (opts.stage) conds.push(eq(candidates.stage, opts.stage));
  if (opts.openingId) conds.push(eq(candidates.openingId, opts.openingId));
  return db
    .select({
      id: candidates.id,
      name: candidates.name,
      email: candidates.email,
      source: candidates.source,
      stage: candidates.stage,
      ownerName: users.name,
      openingTitle: jobOpenings.title,
      appliedAt: candidates.appliedAt,
      updatedAt: candidates.updatedAt,
    })
    .from(candidates)
    .leftJoin(users, eq(users.id, candidates.ownerUserId))
    .leftJoin(jobOpenings, eq(jobOpenings.id, candidates.openingId))
    .where(and(...conds))
    .orderBy(desc(candidates.updatedAt))
    .limit(300);
}

export async function getCandidate(ctx: AuthContext, id: string) {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(and(eq(candidates.id, id), eq(candidates.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!candidate) throw ApiError.notFound();
  const events = await db
    .select({
      id: candidateEvents.id,
      kind: candidateEvents.kind,
      payload: candidateEvents.payload,
      scheduledAt: candidateEvents.scheduledAt,
      createdByName: users.name,
      createdAt: candidateEvents.createdAt,
    })
    .from(candidateEvents)
    .leftJoin(users, eq(users.id, candidateEvents.createdBy))
    .where(eq(candidateEvents.candidateId, id))
    .orderBy(desc(candidateEvents.createdAt));
  return { candidate, events };
}

export async function createCandidate(
  ctx: AuthContext,
  input: { name: string; email?: string; source?: string; openingId?: string },
) {
  if (!can(ctx.access, "recruitment.manage")) throw ApiError.forbidden();
  const [row] = await db
    .insert(candidates)
    .values({
      organizationId: ctx.user.organizationId,
      name: input.name.slice(0, 200),
      email: input.email ?? null,
      source: input.source ?? null,
      openingId: input.openingId ?? null,
      ownerUserId: ctx.user.id,
    })
    .returning({ id: candidates.id });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "CANDIDATE_CREATED",
    entityType: "candidate",
    entityId: row!.id,
  });
  return row!.id;
}

export async function moveCandidateStage(ctx: AuthContext, id: string, stage: string) {
  if (!can(ctx.access, "recruitment.manage")) throw ApiError.forbidden();
  if (!(STAGES as readonly string[]).includes(stage)) throw ApiError.badRequest("Unknown stage");
  const updated = await db
    .update(candidates)
    .set({ stage, updatedAt: new Date() })
    .where(and(eq(candidates.id, id), eq(candidates.organizationId, ctx.user.organizationId)))
    .returning({ id: candidates.id });
  if (!updated[0]) throw ApiError.notFound();
  await db.insert(candidateEvents).values({
    organizationId: ctx.user.organizationId,
    candidateId: id,
    kind: "stage_change",
    payload: { stage },
    createdBy: ctx.user.id,
  });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "CANDIDATE_STAGE_CHANGED",
    entityType: "candidate",
    entityId: id,
    newValue: { stage },
  });
}

export async function addCandidateEvent(
  ctx: AuthContext,
  id: string,
  input: { kind: string; payload?: Record<string, unknown>; scheduledAt?: string },
) {
  if (!can(ctx.access, "recruitment.manage")) throw ApiError.forbidden();
  const [c] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(and(eq(candidates.id, id), eq(candidates.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!c) throw ApiError.notFound();
  const kind = ["note", "interview", "offer"].includes(input.kind) ? input.kind : "note";
  await db.insert(candidateEvents).values({
    organizationId: ctx.user.organizationId,
    candidateId: id,
    kind,
    payload: input.payload ?? {},
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    createdBy: ctx.user.id,
  });
}

// ---------- onboarding / offboarding journeys ----------

const DEFAULT_ONBOARDING = [
  { title: "Complete profile", kind: "task" },
  { title: "Upload identity documents", kind: "document" },
  { title: "Read employee handbook", kind: "knowledge" },
  { title: "Meet your manager", kind: "task" },
  { title: "Device & access setup", kind: "access" },
];
const DEFAULT_OFFBOARDING = [
  { title: "Return hardware", kind: "asset" },
  { title: "Complete handover document", kind: "document" },
  { title: "Close open work items", kind: "task" },
  { title: "Exit interview", kind: "exit_interview" },
];

export async function createJourney(
  ctx: AuthContext,
  input: { kind: "onboarding" | "offboarding"; userId: string; dueDate?: string; template?: boolean },
) {
  if (!can(ctx.access, "lifecycle.manage")) throw ApiError.forbidden();
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, input.userId), eq(users.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!user) throw ApiError.notFound();
  const [journey] = await db
    .insert(journeys)
    .values({
      organizationId: ctx.user.organizationId,
      kind: input.kind,
      userId: input.userId,
      dueDate: input.dueDate ?? null,
      createdBy: ctx.user.id,
    })
    .returning({ id: journeys.id });
  const template = input.template === false ? [] : input.kind === "onboarding" ? DEFAULT_ONBOARDING : DEFAULT_OFFBOARDING;
  if (template.length) {
    await db.insert(journeyItems).values(
      template.map((t) => ({
        organizationId: ctx.user.organizationId,
        journeyId: journey!.id,
        title: t.title,
        kind: t.kind,
        assigneeUserId: t.kind === "asset" || t.kind === "access" ? ctx.user.id : input.userId,
      })),
    );
  }
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: input.kind === "onboarding" ? "ONBOARDING_STARTED" : "OFFBOARDING_STARTED",
    entityType: "journey",
    entityId: journey!.id,
    newValue: { userId: input.userId },
  });
  return journey!.id;
}

export async function listJourneys(ctx: AuthContext, kind: "onboarding" | "offboarding") {
  return db
    .select({
      id: journeys.id,
      userId: journeys.userId,
      userName: users.name,
      status: journeys.status,
      dueDate: journeys.dueDate,
      createdAt: journeys.createdAt,
      doneCount: sql<number>`(SELECT count(*)::int FROM journey_items ji WHERE ji.journey_id = ${journeys.id} AND ji.done)`,
      totalCount: sql<number>`(SELECT count(*)::int FROM journey_items ji WHERE ji.journey_id = ${journeys.id})`,
    })
    .from(journeys)
    .innerJoin(users, eq(users.id, journeys.userId))
    .where(and(eq(journeys.organizationId, ctx.user.organizationId), eq(journeys.kind, kind)))
    .orderBy(desc(journeys.createdAt))
    .limit(100);
}

export async function getJourney(ctx: AuthContext, id: string) {
  const [journey] = await db
    .select({ j: journeys, userName: users.name })
    .from(journeys)
    .innerJoin(users, eq(users.id, journeys.userId))
    .where(and(eq(journeys.id, id), eq(journeys.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!journey) throw ApiError.notFound();
  const items = await db.select().from(journeyItems).where(eq(journeyItems.journeyId, id)).orderBy(asc(journeyItems.title));
  return { ...journey.j, userName: journey.userName, items };
}

/**
 * Phase 8 — exit clearance verify. Cross-checks an offboarding journey's
 * item state against real module state: assets still assigned, open tickets,
 * pending approvals. Returns a per-check pass/fail with detail — HR verifies
 * every row passes before closing the exit.
 */
export async function verifyExitClearance(ctx: AuthContext, journeyId: string) {
  if (!can(ctx.access, "lifecycle.manage")) throw ApiError.forbidden();
  const [journey] = await db
    .select({ id: journeys.id, userId: journeys.userId, kind: journeys.kind, status: journeys.status, userName: users.name })
    .from(journeys)
    .innerJoin(users, eq(users.id, journeys.userId))
    .where(and(eq(journeys.id, journeyId), eq(journeys.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!journey) throw ApiError.notFound();
  if (journey.kind !== "offboarding") throw ApiError.badRequest("Clearance verification applies to offboarding journeys");

  const userId = journey.userId;
  const orgId = ctx.user.organizationId;
  const checks: { key: string; label: string; ok: boolean; detail: string }[] = [];

  // 1. journey checklist itself
  const [items] = await db
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${journeyItems.done})::int`,
    })
    .from(journeyItems)
    .where(eq(journeyItems.journeyId, journeyId));
  checks.push({
    key: "checklist",
    label: "Offboarding checklist",
    ok: (items?.done ?? 0) >= (items?.total ?? 1),
    detail: `${items?.done ?? 0}/${items?.total ?? 0} items done`,
  });

  // 2. no company assets still assigned
  const [assetRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sql`assets`)
    .where(sql`organization_id = ${orgId} AND assigned_to_user_id = ${userId}`);
  checks.push({
    key: "assets",
    label: "All hardware returned",
    ok: (assetRow?.n ?? 0) === 0,
    detail: `${assetRow?.n ?? 0} asset(s) still assigned`,
  });

  // 3. no open support tickets
  const [ticketRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sql`tickets`)
    .where(sql`organization_id = ${orgId} AND requester_id = ${userId} AND status NOT IN ('resolved','closed')`);
  checks.push({
    key: "tickets",
    label: "No open support tickets",
    ok: (ticketRow?.n ?? 0) === 0,
    detail: `${ticketRow?.n ?? 0} open ticket(s)`,
  });

  // 4. no pending leave requests
  const [leaveRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sql`leave_requests`)
    .where(sql`organization_id = ${orgId} AND user_id = ${userId} AND status = 'pending'`);
  checks.push({
    key: "leave",
    label: "No pending leave requests",
    ok: (leaveRow?.n ?? 0) === 0,
    detail: `${leaveRow?.n ?? 0} pending request(s)`,
  });

  const allOk = checks.every((c) => c.ok);
  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: allOk ? "EXIT_CLEARANCE_VERIFIED" : "EXIT_CLEARANCE_BLOCKED",
    entityType: "journey",
    entityId: journeyId,
    newValue: { checks },
  });
  return { journeyId, employee: journey.userName, ok: allOk, checks };
}

export async function toggleJourneyItem(ctx: AuthContext, itemId: string, done: boolean) {
  const [item] = await db
    .select({ i: journeyItems, orgId: journeyItems.organizationId })
    .from(journeyItems)
    .where(and(eq(journeyItems.id, itemId), eq(journeyItems.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!item) throw ApiError.notFound();
  // assignee can toggle own items; lifecycle managers toggle any
  if (item.i.assigneeUserId !== ctx.user.id && !can(ctx.access, "lifecycle.manage")) throw ApiError.forbidden();
  await db.update(journeyItems).set({ done, doneAt: done ? new Date() : null }).where(eq(journeyItems.id, itemId));
  if (done) {
    const [remaining] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(journeyItems)
      .where(and(eq(journeyItems.journeyId, item.i.journeyId), eq(journeyItems.done, false)));
    if ((remaining?.n ?? 0) === 0) {
      await db
        .update(journeys)
        .set({ status: "completed", completedAt: new Date() })
        .where(and(eq(journeys.id, item.i.journeyId), eq(journeys.organizationId, ctx.user.organizationId)));
    }
  }
}

export async function addJourneyItem(
  ctx: AuthContext,
  journeyId: string,
  input: { title: string; kind?: string; assigneeUserId?: string },
) {
  if (!can(ctx.access, "lifecycle.manage")) throw ApiError.forbidden();
  const [j] = await db
    .select({ id: journeys.id })
    .from(journeys)
    .where(and(eq(journeys.id, journeyId), eq(journeys.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!j) throw ApiError.notFound();
  const kind = ["task", "document", "knowledge", "access", "asset", "exit_interview"].includes(input.kind ?? "")
    ? input.kind!
    : "task";
  await db.insert(journeyItems).values({
    organizationId: ctx.user.organizationId,
    journeyId,
    title: input.title.slice(0, 200),
    kind,
    assigneeUserId: input.assigneeUserId ?? null,
  });
}

// ---------- performance ----------

export async function createCycle(
  ctx: AuthContext,
  input: { name: string; periodLabel: string; selfDueAt?: string; managerDueAt?: string },
) {
  if (!can(ctx.access, "performance.manage")) throw ApiError.forbidden();
  const [cycle] = await db
    .insert(reviewCycles)
    .values({
      organizationId: ctx.user.organizationId,
      name: input.name.slice(0, 120),
      periodLabel: input.periodLabel.slice(0, 40),
      selfDueAt: input.selfDueAt ?? null,
      managerDueAt: input.managerDueAt ?? null,
      createdBy: ctx.user.id,
    })
    .returning({ id: reviewCycles.id });

  // seed one entry per active employee with their manager
  const emps = await db
    .select({ userId: employees.userId, managerId: employees.managerUserId })
    .from(employees)
    .innerJoin(users, eq(users.id, employees.userId))
    .where(and(eq(employees.organizationId, ctx.user.organizationId), eq(users.status, "active")));
  if (emps.length) {
    await db.insert(reviewEntries).values(
      emps.map((e) => ({
        organizationId: ctx.user.organizationId,
        cycleId: cycle!.id,
        employeeUserId: e.userId,
        managerUserId: e.managerId,
      })),
    );
  }
  return cycle!.id;
}

export async function listCycles(ctx: AuthContext) {
  return db
    .select({
      id: reviewCycles.id,
      name: reviewCycles.name,
      periodLabel: reviewCycles.periodLabel,
      status: reviewCycles.status,
      selfDueAt: reviewCycles.selfDueAt,
      managerDueAt: reviewCycles.managerDueAt,
      entries: sql<number>`(SELECT count(*)::int FROM review_entries re WHERE re.cycle_id = ${reviewCycles.id})`,
    })
    .from(reviewCycles)
    .where(eq(reviewCycles.organizationId, ctx.user.organizationId))
    .orderBy(desc(reviewCycles.createdAt))
    .limit(50);
}

export async function myReviewEntries(ctx: AuthContext) {
  return db
    .select({
      id: reviewEntries.id,
      cycleName: reviewCycles.name,
      periodLabel: reviewCycles.periodLabel,
      status: reviewEntries.status,
      selfDueAt: reviewCycles.selfDueAt,
      outcome: reviewEntries.outcome,
    })
    .from(reviewEntries)
    .innerJoin(reviewCycles, eq(reviewCycles.id, reviewEntries.cycleId))
    .where(and(eq(reviewEntries.employeeUserId, ctx.user.id), eq(reviewEntries.organizationId, ctx.user.organizationId)))
    .orderBy(desc(reviewEntries.createdAt))
    .limit(50);
}

async function loadEntryForReview(ctx: AuthContext, entryId: string) {
  const [entry] = await db
    .select()
    .from(reviewEntries)
    .where(and(eq(reviewEntries.id, entryId), eq(reviewEntries.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!entry) throw ApiError.notFound();
  const isSelf = entry.employeeUserId === ctx.user.id;
  const isManager = entry.managerUserId === ctx.user.id;
  const isHr = can(ctx.access, "performance.manage");
  if (!isSelf && !isManager && !isHr) throw ApiError.forbidden();
  return { entry, isSelf, isManager, isHr };
}

export async function saveSelfReview(
  ctx: AuthContext,
  entryId: string,
  input: { achievements: string; challenges?: string; goals?: string },
) {
  const { entry, isSelf } = await loadEntryForReview(ctx, entryId);
  if (!isSelf) throw ApiError.forbidden();
  if (!["pending", "self_done"].includes(entry.status)) throw ApiError.badRequest("Cycle closed for self review");
  await db
    .update(reviewEntries)
    .set({
      selfAchievements: input.achievements.slice(0, 5000),
      selfChallenges: input.challenges?.slice(0, 5000) ?? null,
      selfGoals: input.goals?.slice(0, 5000) ?? null,
      status: "self_done",
    })
    .where(eq(reviewEntries.id, entryId));
}

export async function saveManagerReview(
  ctx: AuthContext,
  entryId: string,
  input: { feedback: string; rating?: number; outcome?: string },
) {
  const { entry, isManager, isHr } = await loadEntryForReview(ctx, entryId);
  if (!isManager && !isHr) throw ApiError.forbidden();
  if (["finalized"].includes(entry.status)) throw ApiError.badRequest("Already finalized");
  await db
    .update(reviewEntries)
    .set({
      managerFeedback: input.feedback.slice(0, 5000),
      managerRating: input.rating != null ? Math.min(Math.max(input.rating, 1), 5) : null,
      outcome: input.outcome ?? null,
      status: "manager_done",
    })
    .where(eq(reviewEntries.id, entryId));
}

export async function finalizeReview(ctx: AuthContext, entryId: string, outcome: string) {
  const { isHr, isManager } = await loadEntryForReview(ctx, entryId);
  if (!isHr && !isManager) throw ApiError.forbidden();
  await db
    .update(reviewEntries)
    .set({ status: "finalized", outcome: outcome.slice(0, 2000), finalizedAt: new Date() })
    .where(eq(reviewEntries.id, entryId));
}

export async function teamReviewEntries(ctx: AuthContext, cycleId: string) {
  const hrAll = can(ctx.access, "performance.manage");
  const conds = [
    eq(reviewEntries.organizationId, ctx.user.organizationId),
    eq(reviewEntries.cycleId, cycleId),
    hrAll
      ? undefined
      : sql`${reviewEntries.employeeUserId} IN (SELECT user_id FROM employees WHERE manager_user_id = ${ctx.user.id})`,
  ];
  return db
    .select({
      id: reviewEntries.id,
      employeeName: users.name,
      status: reviewEntries.status,
      managerRating: reviewEntries.managerRating,
      outcome: reviewEntries.outcome,
    })
    .from(reviewEntries)
    .innerJoin(users, eq(users.id, reviewEntries.employeeUserId))
    .where(and(...conds))
    .limit(200);
}

// ---------- learning ----------

export async function listCourses(ctx: AuthContext) {
  const rows = await db
    .select({
      id: courses.id,
      title: courses.title,
      category: courses.category,
      required: courses.required,
      durationMins: courses.durationMins,
      description: courses.description,
      enrolled: sql<number>`(SELECT count(*)::int FROM course_enrollments ce WHERE ce.course_id = ${courses.id})`,
    })
    .from(courses)
    .where(and(eq(courses.organizationId, ctx.user.organizationId), eq(courses.status, "published")))
    .orderBy(asc(courses.title))
    .limit(100);
  return rows;
}

export async function myEnrollments(ctx: AuthContext) {
  return db
    .select({
      id: courseEnrollments.id,
      courseTitle: courses.title,
      courseId: courses.id,
      required: courses.required,
      status: courseEnrollments.status,
      dueAt: courseEnrollments.dueAt,
      completedAt: courseEnrollments.completedAt,
    })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courses.id, courseEnrollments.courseId))
    .where(and(eq(courseEnrollments.userId, ctx.user.id), eq(courseEnrollments.organizationId, ctx.user.organizationId)))
    .orderBy(asc(courseEnrollments.dueAt))
    .limit(100);
}

export async function enroll(ctx: AuthContext, courseId: string, userIds: string[], dueAt?: string) {
  const manages = can(ctx.access, "learning.manage");
  const targets = manages ? userIds : [ctx.user.id];
  if (targets.length > 200) throw ApiError.badRequest("Too many users");
  const valid = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, targets), eq(users.organizationId, ctx.user.organizationId)));
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!course) throw ApiError.notFound();
  if (!valid.length) throw ApiError.badRequest("No valid users");
  await db
    .insert(courseEnrollments)
    .values(
      valid.map((u) => ({
        organizationId: ctx.user.organizationId,
        courseId,
        userId: u.id,
        dueAt: dueAt ?? null,
        assignedBy: ctx.user.id,
      })),
    )
    .onConflictDoNothing();
}

export async function setEnrollmentProgress(ctx: AuthContext, enrollmentId: string, status: "in_progress" | "completed") {
  const updated = await db
    .update(courseEnrollments)
    .set({ status, ...(status === "completed" ? { completedAt: new Date() } : {}) })
    .where(
      and(
        eq(courseEnrollments.id, enrollmentId),
        eq(courseEnrollments.userId, ctx.user.id),
        eq(courseEnrollments.organizationId, ctx.user.organizationId),
      ),
    )
    .returning({ id: courseEnrollments.id });
  if (!updated[0]) throw ApiError.notFound();
}

// ---------- recognition ----------

export async function recognitionFeed(ctx: AuthContext) {
  return db
    .select({
      id: recognitions.id,
      message: recognitions.message,
      badge: recognitions.badge,
      createdAt: recognitions.createdAt,
      fromName: sql<string>`(SELECT name FROM users fu WHERE fu.id = ${recognitions.fromUserId})`,
      toName: sql<string>`(SELECT name FROM users tu WHERE tu.id = ${recognitions.toUserId})`,
    })
    .from(recognitions)
    .where(eq(recognitions.organizationId, ctx.user.organizationId))
    .orderBy(desc(recognitions.createdAt))
    .limit(50);
}

export async function giveRecognition(
  ctx: AuthContext,
  input: { toUserId: string; message: string; badge?: string; visibility?: string },
) {
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, input.toUserId), eq(users.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!target) throw ApiError.badRequest("Unknown recipient");
  await db.insert(recognitions).values({
    organizationId: ctx.user.organizationId,
    fromUserId: ctx.user.id,
    toUserId: input.toUserId,
    message: input.message.slice(0, 1000),
    badge: ["thanks", "great_work", "team_player", "customer_hero", "innovation"].includes(input.badge ?? "")
      ? input.badge!
      : "thanks",
    visibility: ["private", "team", "department", "company"].includes(input.visibility ?? "") ? input.visibility! : "company",
  });
}

// ---------- HR change requests ----------

export async function requestProfileChange(
  ctx: AuthContext,
  input: { fieldKey: string; requestedValue: string },
) {
  const fieldKey = ["phone", "emergency_contact", "address", "skills"].includes(input.fieldKey) ? input.fieldKey : null;
  if (!fieldKey) throw ApiError.badRequest("Unsupported field");
  await db.insert(profileChangeRequests).values({
    organizationId: ctx.user.organizationId,
    userId: ctx.user.id,
    fieldKey,
    requestedValue: input.requestedValue.slice(0, 2000),
  });
}

export async function listProfileChanges(ctx: AuthContext, opts: { pendingOnly?: boolean } = {}) {
  const manage = can(ctx.access, "hr.change_manage");
  const conds = [
    eq(profileChangeRequests.organizationId, ctx.user.organizationId),
    manage ? undefined : eq(profileChangeRequests.userId, ctx.user.id),
    opts.pendingOnly ? eq(profileChangeRequests.status, "pending") : undefined,
  ];
  return db
    .select({
      id: profileChangeRequests.id,
      userName: users.name,
      userId: profileChangeRequests.userId,
      fieldKey: profileChangeRequests.fieldKey,
      currentValue: profileChangeRequests.currentValue,
      requestedValue: profileChangeRequests.requestedValue,
      status: profileChangeRequests.status,
      createdAt: profileChangeRequests.createdAt,
    })
    .from(profileChangeRequests)
    .innerJoin(users, eq(users.id, profileChangeRequests.userId))
    .where(and(...conds))
    .orderBy(desc(profileChangeRequests.createdAt))
    .limit(200);
}

export async function decideProfileChange(ctx: AuthContext, id: string, approve: boolean) {
  if (!can(ctx.access, "hr.change_manage")) throw ApiError.forbidden();
  const [row] = await db
    .select()
    .from(profileChangeRequests)
    .where(and(eq(profileChangeRequests.id, id), eq(profileChangeRequests.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  if (row.status !== "pending") throw ApiError.badRequest("Already reviewed");
  await db
    .update(profileChangeRequests)
    .set({ status: approve ? "approved" : "rejected", reviewedBy: ctx.user.id, reviewedAt: new Date() })
    .where(eq(profileChangeRequests.id, id));
  if (approve) {
    // apply to the employee record where the column exists
    const colMap: Record<string, string> = {
      phone: "phone",
      emergency_contact: "emergency_contact",
      address: "address",
    };
    const col = colMap[row.fieldKey];
    if (col) {
      await db.execute(
        sql`UPDATE employees SET ${sql.raw(col)} = ${row.requestedValue} WHERE user_id = ${row.userId} AND organization_id = ${ctx.user.organizationId}`,
      );
    }
  }
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: approve ? "PROFILE_CHANGE_APPROVED" : "PROFILE_CHANGE_REJECTED",
    entityType: "profile_change_request",
    entityId: id,
    newValue: { fieldKey: row.fieldKey },
  });
}

export async function requestJobChange(
  ctx: AuthContext,
  input: { userId: string; kind: string; oldValue?: unknown; newValue: unknown; effectiveAt?: string; note?: string },
) {
  if (!can(ctx.access, "hr.change_manage")) throw ApiError.forbidden();
  const kinds = ["promotion", "transfer", "compensation", "title_change"];
  if (!kinds.includes(input.kind)) throw ApiError.badRequest("Unknown change kind");
  const [row] = await db
    .insert(jobChanges)
    .values({
      organizationId: ctx.user.organizationId,
      userId: input.userId,
      kind: input.kind,
      oldValue: (input.oldValue ?? null) as never,
      newValue: input.newValue as never,
      effectiveAt: input.effectiveAt ?? null,
      note: input.note ?? null,
      requestedBy: ctx.user.id,
    })
    .returning({ id: jobChanges.id });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "JOB_CHANGE_PROPOSED",
    entityType: "job_change",
    entityId: row!.id,
    newValue: { kind: input.kind, userId: input.userId },
  });
  return row!.id;
}

export async function decideJobChange(ctx: AuthContext, id: string, action: "approve" | "apply" | "reject") {
  if (!can(ctx.access, "hr.change_manage")) throw ApiError.forbidden();
  const [row] = await db
    .select()
    .from(jobChanges)
    .where(and(eq(jobChanges.id, id), eq(jobChanges.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  if (action === "approve") {
    if (row.status !== "proposed") throw ApiError.badRequest("Not proposed");
    await db
      .update(jobChanges)
      .set({ status: "approved", approvedBy: ctx.user.id, approvedAt: new Date() })
      .where(eq(jobChanges.id, id));
  } else if (action === "reject") {
    await db.update(jobChanges).set({ status: "rejected" }).where(eq(jobChanges.id, id));
  } else {
    if (row.status !== "approved") throw ApiError.badRequest("Approve before applying");
    // apply title changes to the employee record
    const nv = row.newValue as Record<string, unknown> | null;
    if (typeof nv?.jobTitle === "string") {
      await db
        .update(employees)
        .set({ jobTitle: nv.jobTitle })
        .where(and(eq(employees.userId, row.userId), eq(employees.organizationId, ctx.user.organizationId)));
    }
    await db.update(jobChanges).set({ status: "applied" }).where(eq(jobChanges.id, id));
  }
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: `JOB_CHANGE_${action.toUpperCase()}`,
    entityType: "job_change",
    entityId: id,
  });
}

export async function listJobChanges(ctx: AuthContext) {
  return db
    .select({
      id: jobChanges.id,
      userName: users.name,
      kind: jobChanges.kind,
      newValue: jobChanges.newValue,
      effectiveAt: jobChanges.effectiveAt,
      status: jobChanges.status,
      createdAt: jobChanges.createdAt,
    })
    .from(jobChanges)
    .innerJoin(users, eq(users.id, jobChanges.userId))
    .where(eq(jobChanges.organizationId, ctx.user.organizationId))
    .orderBy(desc(jobChanges.createdAt))
    .limit(200);
}

/** §41 — lifecycle timeline assembled from real events across modules. */
export async function lifecycleTimeline(ctx: AuthContext, userId: string) {
  const targetInOrg = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!targetInOrg[0]) throw ApiError.notFound();

  const [emp] = await db
    .select({ hiredAt: employees.hiredAt, jobTitle: employees.jobTitle })
    .from(employees)
    .where(and(eq(employees.userId, userId), eq(employees.organizationId, ctx.user.organizationId)))
    .limit(1);

  const events: { at: Date | string | null; label: string; detail?: string | null }[] = [];
  if (emp?.hiredAt) events.push({ at: emp.hiredAt, label: "Joined the company" });
  const jc = await db
    .select({ kind: jobChanges.kind, effectiveAt: jobChanges.effectiveAt, newValue: jobChanges.newValue, status: jobChanges.status })
    .from(jobChanges)
    .where(and(eq(jobChanges.userId, userId), inArray(jobChanges.status, ["approved", "applied"])));
  for (const c of jc) events.push({ at: c.effectiveAt, label: c.kind.replace("_", " "), detail: JSON.stringify(c.newValue) });
  const reviews = await db
    .select({ finalizedAt: reviewEntries.finalizedAt, outcome: reviewEntries.outcome, period: reviewCycles.periodLabel })
    .from(reviewEntries)
    .innerJoin(reviewCycles, eq(reviewCycles.id, reviewEntries.cycleId))
    .where(and(eq(reviewEntries.employeeUserId, userId), eq(reviewEntries.status, "finalized")))
    .limit(20);
  for (const r of reviews) events.push({ at: r.finalizedAt, label: `Performance review (${r.period})`, detail: r.outcome });
  const recs = await db
    .select({ createdAt: recognitions.createdAt, badge: recognitions.badge, message: recognitions.message })
    .from(recognitions)
    .where(eq(recognitions.toUserId, userId))
    .limit(20);
  for (const r of recs) events.push({ at: r.createdAt, label: `Recognition: ${r.badge}`, detail: r.message });

  events.sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime());
  return { jobTitle: emp?.jobTitle ?? null, events };
}
