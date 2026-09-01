/**
 * Surveys & polls: HR/Admin author, everyone votes once per survey.
 * Results show counts; individual votes are never exposed (secret ballot).
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { surveyVotes, surveys } from "@/db/schema";
import { can } from "@/modules/iam/engine";

export interface SurveyRow {
  id: string;
  question: string;
  options: string[];
  createdAt: Date;
  myVote: number | null;
  counts: number[];
  totalVotes: number;
  canManage: boolean;
}

/** Active surveys with aggregated results + the caller's own vote. */
export async function listActive(ctx: AuthContext): Promise<SurveyRow[]> {
  const orgId = ctx.user.organizationId;
  const rows = await db
    .select()
    .from(surveys)
    .where(
      and(
        eq(surveys.organizationId, orgId),
        // open forever or not yet closed
        sql`(${surveys.closesAt} IS NULL OR ${surveys.closesAt} > now())`,
      ),
    )
    .orderBy(desc(surveys.createdAt))
    .limit(50);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const votes = await db
    .select({ surveyId: surveyVotes.surveyId, userId: surveyVotes.userId, optionIndex: surveyVotes.optionIndex })
    .from(surveyVotes)
    .where(inArray(surveyVotes.surveyId, ids));

  const manage = can(ctx.access, "announcements.manage");

  return rows.map((s) => {
    const mine = votes.filter((v) => v.surveyId === s.id);
    const counts = s.options.map((_, i) => mine.filter((v) => v.optionIndex === i).length);
    const myVote = mine.find((v) => v.userId === ctx.user.id)?.optionIndex ?? null;
    return {
      id: s.id,
      question: s.question,
      options: s.options,
      createdAt: s.createdAt,
      myVote,
      counts,
      totalVotes: mine.length,
      canManage: manage,
    };
  });
}

export async function createSurvey(
  ctx: AuthContext,
  input: { question: string; options: string[] },
) {
  if (!can(ctx.access, "announcements.manage")) {
    throw ApiError.forbidden("Missing permission to create surveys");
  }
  const options = input.options.map((o) => o.trim()).filter(Boolean);
  if (options.length < 2) throw ApiError.badRequest("A poll needs at least two options");

  const inserted = await db
    .insert(surveys)
    .values({
      organizationId: ctx.user.organizationId,
      question: input.question.trim().slice(0, 300),
      options: options.slice(0, 8),
      createdBy: ctx.user.id,
    })
    .returning({ id: surveys.id });
  const row = inserted[0];
  if (!row) throw new Error("Insert returned no row");

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "SURVEY_CREATED",
    entityType: "survey",
    entityId: row.id,
    newValue: { question: input.question },
  });

  return row.id;
}

/** One vote per user per survey. Re-voting updates the choice. */
export async function vote(ctx: AuthContext, surveyId: string, optionIndex: number) {
  const [s] = await db
    .select({ options: surveys.options, closesAt: surveys.closesAt })
    .from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!s) throw ApiError.notFound();
  if (s.closesAt && s.closesAt <= new Date()) {
    throw ApiError.badRequest("This poll has closed");
  }
  if (optionIndex < 0 || optionIndex >= s.options.length) {
    throw ApiError.badRequest("Invalid option");
  }

  await db
    .insert(surveyVotes)
    .values({ surveyId, userId: ctx.user.id, optionIndex })
    .onConflictDoUpdate({
      target: [surveyVotes.surveyId, surveyVotes.userId],
      set: { optionIndex, votedAt: new Date() },
    });

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "SURVEY_VOTED",
    entityType: "survey",
    entityId: surveyId,
  });
}
