/**
 * Phase 1 — password change, reset, lockout, managed-mode requests.
 */
import { and, desc, eq, gt, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { hashPassword, hashToken, newSessionToken, verifyPassword } from "@/lib/password";
import { passwordStrongEnough } from "@/lib/password-policy";
import { appUrl } from "@/lib/mailer";
import { sendPasswordResetEmail } from "@/lib/mail/activation";
import { enforceRateLimit } from "@/lib/ratelimit";
import { notify } from "@/modules/notifications/service";
import type { AuthContext } from "@/lib/session";
import { can } from "@/modules/iam/engine";
import {
  organizations,
  passwordChangeRequests,
  passwordResetTokens,
  sessions,
  userRoles,
  roles,
  users,
} from "@/db/schema";

const RESET_TTL_MS = 30 * 60_000;
const LOCK_MS = 30 * 60_000;

export function isLocked(lockedUntil: Date | null | undefined, now = new Date()): boolean {
  return !!lockedUntil && lockedUntil > now;
}

export async function recordFailedLogin(userId: string, email: string, orgId: string): Promise<void> {
  try {
    await enforceRateLimit("ip", `login-acct:${email}`, { limit: 10, windowSeconds: 900 });
  } catch (e) {
    if (e instanceof ApiError && e.status === 429) {
      const until = new Date(Date.now() + LOCK_MS);
      await db.update(users).set({ lockedUntil: until }).where(eq(users.id, userId));
      const admins = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(and(eq(roles.organizationId, orgId), eq(roles.key, "admin")));
      for (const a of admins) {
        void notify({
          organizationId: orgId,
          userId: a.userId,
          type: "system",
          title: "Account locked",
          body: `${email} is locked for 30 minutes after repeated failed sign-ins.`,
          link: "/admin/security",
        }).catch(() => {});
      }
      throw ApiError.forbidden("This account is locked for 30 minutes after too many failed sign-ins.");
    }
    throw e;
  }
}

export async function changePassword(
  ctx: AuthContext,
  input: { current: string; next: string; currentToken?: string | null },
): Promise<{ pending?: boolean }> {
  if (ctx.user.status === "suspended") throw ApiError.forbidden();
  const [row] = await db
    .select({
      passwordHash: users.passwordHash,
      authMethod: users.authMethod,
      passwordMode: organizations.passwordMode,
    })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.organizationId))
    .where(eq(users.id, ctx.user.id))
    .limit(1);
  if (!row) throw ApiError.notFound();
  if (row.authMethod === "sso") throw ApiError.forbidden("This account uses single sign-on.");
  if (!(await verifyPassword(input.current, row.passwordHash))) {
    throw ApiError.unauthorized("Current password is incorrect");
  }
  if (!passwordStrongEnough(input.next)) {
    throw ApiError.badRequest("Choose a stronger password (10+ characters, letters and a number)");
  }
  if (row.passwordMode === "managed") {
    await db.insert(passwordChangeRequests).values({
      organizationId: ctx.user.organizationId,
      userId: ctx.user.id,
    });
    await audit({
      organizationId: ctx.user.organizationId,
      actorUserId: ctx.user.id,
      action: "PASSWORD_CHANGE_REQUESTED",
      entityType: "user",
      entityId: ctx.user.id,
    });
    return { pending: true };
  }
  const passwordHash = await hashPassword(input.next);
  await db.update(users).set({ passwordHash, lockedUntil: null }).where(eq(users.id, ctx.user.id));
  if (input.currentToken) {
    await db
      .delete(sessions)
      .where(and(eq(sessions.userId, ctx.user.id), ne(sessions.tokenHash, hashToken(input.currentToken))));
  } else {
    await db.delete(sessions).where(eq(sessions.userId, ctx.user.id));
  }
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "PASSWORD_CHANGED",
    entityType: "user",
    entityId: ctx.user.id,
  });
  return {};
}

export async function requestPasswordReset(email: string, ip: string): Promise<void> {
  await enforceRateLimit("ip", `forgot:${ip}`, { limit: 5, windowSeconds: 900 });
  await enforceRateLimit("ip", `forgot-email:${email}`, { limit: 5, windowSeconds: 900 });
  const [row] = await db
    .select({ id: users.id, authMethod: users.authMethod, email: users.email })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  if (!row || row.authMethod === "sso") return; // do not leak whether the mailbox exists
  const raw = newSessionToken();
  await db.insert(passwordResetTokens).values({
    userId: row.id,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });
  void sendPasswordResetEmail({
    to: row.email,
    resetUrl: `${appUrl()}/reset-password?token=${encodeURIComponent(raw)}`,
  }).catch(() => {});
}

export async function resetPassword(rawToken: string, next: string): Promise<void> {
  if (!passwordStrongEnough(next)) {
    throw ApiError.badRequest("Choose a stronger password (10+ characters, letters and a number)");
  }
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, hashToken(rawToken)))
    .limit(1);
  if (!row || row.usedAt || row.expiresAt <= new Date()) {
    throw ApiError.notFound("This reset link is invalid or has expired.");
  }
  const passwordHash = await hashPassword(next);
  await db.update(users).set({ passwordHash, lockedUntil: null }).where(eq(users.id, row.userId));
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
  await db.delete(sessions).where(eq(sessions.userId, row.userId));
}

export async function listOwnSessions(ctx: AuthContext, currentToken?: string | null) {
  const currentHash = currentToken ? hashToken(currentToken) : null;
  const rows = await db
    .select({
      id: sessions.id,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      tokenHash: sessions.tokenHash,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, ctx.user.id), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.createdAt));
  return rows.map(({ tokenHash, ...s }) => ({ ...s, current: currentHash === tokenHash }));
}

export async function revokeOwnSession(ctx: AuthContext, sessionId: string, currentToken?: string | null) {
  const currentHash = currentToken ? hashToken(currentToken) : null;
  const [row] = await db
    .select({ id: sessions.id, tokenHash: sessions.tokenHash })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, ctx.user.id)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  if (currentHash && row.tokenHash === currentHash) {
    throw ApiError.badRequest("Use Sign out to end this device");
  }
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function revokeOtherSessions(ctx: AuthContext, currentToken: string) {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, ctx.user.id), ne(sessions.tokenHash, hashToken(currentToken))));
}

export async function listPasswordChangeRequests(ctx: AuthContext) {
  if (!canManage(ctx)) throw ApiError.forbidden("Missing permission: users.manage");
  return db
    .select({
      id: passwordChangeRequests.id,
      userId: passwordChangeRequests.userId,
      email: users.email,
      name: users.name,
      status: passwordChangeRequests.status,
      createdAt: passwordChangeRequests.createdAt,
    })
    .from(passwordChangeRequests)
    .innerJoin(users, eq(users.id, passwordChangeRequests.userId))
    .where(
      and(
        eq(passwordChangeRequests.organizationId, ctx.user.organizationId),
        eq(passwordChangeRequests.status, "pending"),
      ),
    )
    .orderBy(desc(passwordChangeRequests.createdAt));
}

export async function decidePasswordChange(ctx: AuthContext, id: string, approve: boolean) {
  if (!canManage(ctx)) throw ApiError.forbidden("Missing permission: users.manage");
  const [row] = await db
    .select()
    .from(passwordChangeRequests)
    .where(and(eq(passwordChangeRequests.id, id), eq(passwordChangeRequests.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row || row.status !== "pending") throw ApiError.notFound();
  await db
    .update(passwordChangeRequests)
    .set({ status: approve ? "approved" : "rejected", decidedBy: ctx.user.id, decidedAt: new Date() })
    .where(eq(passwordChangeRequests.id, id));
  if (approve) {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, row.userId)).limit(1);
    if (u) await requestPasswordReset(u.email, "admin-approve");
  }
}

function canManage(ctx: AuthContext): boolean {
  return can(ctx.access, "users.manage");
}
