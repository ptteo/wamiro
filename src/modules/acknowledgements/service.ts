/**
 * Acknowledgements (e-sign-lite, blueprint §102): HR publishes a policy;
 * every employee signs it by typing their full name. Signature stores name,
 * timestamp and IP — legally meaningful enough for internal acknowledgements
 * without claiming qualified-signature status.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { acknowledgementSignatures, acknowledgements, users } from "@/db/schema";
import { can } from "@/modules/iam/engine";

/** All acknowledgements + the caller's signature state. */
export async function listForUser(ctx: AuthContext) {
  const rows = await db
    .select({
      id: acknowledgements.id,
      title: acknowledgements.title,
      body: acknowledgements.body,
      createdBy: acknowledgements.createdBy,
      authorName: users.name,
      authorAvatar: users.avatarUrl,
      createdAt: acknowledgements.createdAt,
      signedAt: acknowledgementSignatures.signedAt,
      mySignature: acknowledgementSignatures.signatureName,
    })
    .from(acknowledgements)
    .leftJoin(
      acknowledgementSignatures,
      and(
        eq(acknowledgementSignatures.acknowledgementId, acknowledgements.id),
        eq(acknowledgementSignatures.userId, ctx.user.id),
      ),
    )
    .leftJoin(users, eq(users.id, acknowledgements.createdBy))
    .where(eq(acknowledgements.organizationId, ctx.user.organizationId))
    .orderBy(desc(acknowledgements.createdAt));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    authorName: r.authorName,
    authorAvatar: r.authorAvatar,
    createdAt: r.createdAt,
    signedAt: r.signedAt,
    mySignature: r.mySignature,
  }));
}

export async function create(
  ctx: AuthContext,
  input: { title: string; body: string },
): Promise<{ id: string }> {
  if (!can(ctx.access, "announcements.manage")) {
    throw ApiError.forbidden("Only HR/Admin can publish acknowledgements");
  }
  const inserted = await db
    .insert(acknowledgements)
    .values({
      organizationId: ctx.user.organizationId,
      createdBy: ctx.user.id,
      title: input.title.trim().slice(0, 200),
      body: input.body.trim().slice(0, 20_000),
    })
    .returning({ id: acknowledgements.id });
  const row = inserted[0];
  if (!row) throw new Error("Insert returned no row");

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ACKNOWLEDGEMENT_PUBLISHED",
    entityType: "acknowledgement",
    entityId: row.id,
    newValue: { title: input.title },
  });
  return row;
}

/**
 * Sign with the user's typed full name (must match their account name,
 * case-insensitive). Records IP for the signature record.
 */
export async function sign(
  ctx: AuthContext,
  id: string,
  signatureName: string,
  ip: string | null,
) {
  const [ack] = await db
    .select({ id: acknowledgements.id })
    .from(acknowledgements)
    .where(
      and(eq(acknowledgements.id, id), eq(acknowledgements.organizationId, ctx.user.organizationId)),
    )
    .limit(1);
  if (!ack) throw ApiError.notFound();

  const normalized = signatureName.trim().replace(/\s+/g, " ");
  if (normalized.toLowerCase() !== ctx.user.name.toLowerCase()) {
    throw ApiError.badRequest('Type your full name exactly as it appears on your profile');
  }

  await db
    .insert(acknowledgementSignatures)
    .values({ acknowledgementId: id, userId: ctx.user.id, signatureName: normalized, ip })
    .onConflictDoNothing();

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ACKNOWLEDGEMENT_SIGNED",
    entityType: "acknowledgement",
    entityId: id,
    metadata: { signatureName: normalized },
  });
}

/** Admin overview: completion per acknowledgement. */
export async function completionStats(ctx: AuthContext) {
  const rows = await db
    .select({
      id: acknowledgements.id,
      title: acknowledgements.title,
      createdAt: acknowledgements.createdAt,
      signed: sql<number>`(SELECT count(*)::int FROM acknowledgement_signatures s WHERE s.acknowledgement_id = ${acknowledgements.id})`,
      total: sql<number>`(SELECT count(*)::int FROM users u WHERE u.organization_id = ${ctx.user.organizationId} AND u.status = 'active')`,
    })
    .from(acknowledgements)
    .where(eq(acknowledgements.organizationId, ctx.user.organizationId))
    .orderBy(desc(acknowledgements.createdAt))
    .limit(50);
  return rows.map((r) => ({ ...r, signed: Number(r.signed), total: Number(r.total) }));
}
