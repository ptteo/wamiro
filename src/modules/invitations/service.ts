/**
 * Phase 1 — invitation tokens. New invites never put a password in email.
 * ponytail: `legacy: true` keeps the old temp-password path for one release.
 */
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db, first } from "@/lib/db";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { ApiError } from "@/lib/errors";
import { emailAllowedForDomains } from "@/lib/email-domain";
import { hashPassword, hashToken, newSessionToken } from "@/lib/password";
import { passwordStrongEnough } from "@/lib/password-policy";
import { appUrl } from "@/lib/mailer";
import { sendInviteLinkEmail } from "@/lib/mail/activation";
import { enforceRateLimit } from "@/lib/ratelimit";
import { createSession, type AuthContext } from "@/lib/session";
import { assertSeatAvailable } from "@/modules/billing/service";
import { can } from "@/modules/iam/engine";
import {
  employees,
  invitationTokens,
  organizationMemberships,
  organizations,
  roles,
  userRoles,
  users,
} from "@/db/schema";

const INVITE_TTL_MS = 7 * 86_400_000;
const PRIVILEGED_ROLES = new Set(["admin", "hr_admin", "ceo", "super_admin"]);

function canInviteAnyone(ctx: AuthContext): boolean {
  return can(ctx.access, "users.manage");
}

function canInviteTeam(ctx: AuthContext): boolean {
  return can(ctx.access, "team.invite") || canInviteAnyone(ctx);
}

function assertCanInvite(ctx: AuthContext): void {
  if (!canInviteTeam(ctx)) throw ApiError.forbidden("Missing permission: team.invite");
  if (ctx.org.status !== "active") throw ApiError.forbidden("This organization is suspended");
}

export function acceptUrlFor(token: string): string {
  return `${appUrl()}/invite/accept?token=${encodeURIComponent(token)}`;
}

export async function createInvitation(
  ctx: AuthContext,
  input: { name: string; email: string; roleKey: string; managerUserId?: string | null },
): Promise<{ userId: string; inviteId: string; inviteUrl?: string; linked?: boolean }> {
  assertCanInvite(ctx);
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (email === ctx.user.email) throw ApiError.badRequest("You cannot invite yourself");

  await enforceRateLimit("org", `invite:${ctx.user.organizationId}`, {
    limit: Number(process.env.INVITE_RATE_LIMIT_PER_HOUR ?? 100),
    windowSeconds: 3600,
  });

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      status: organizations.status,
      allowedEmailDomains: organizations.allowedEmailDomains,
    })
    .from(organizations)
    .where(eq(organizations.id, ctx.user.organizationId))
    .limit(1);
  if (!org || org.status !== "active") throw ApiError.forbidden("This organization is suspended");
  if (!emailAllowedForDomains(email, org.allowedEmailDomains)) {
    throw ApiError.badRequest("Invites are limited to this organization's email domains");
  }

  const teamOnly = !canInviteAnyone(ctx);
  if (teamOnly && PRIVILEGED_ROLES.has(input.roleKey)) {
    throw ApiError.forbidden("Managers can only invite people onto their own team");
  }
  const managerUserId = teamOnly ? ctx.user.id : (input.managerUserId ?? ctx.user.id);
  if (teamOnly && input.managerUserId && input.managerUserId !== ctx.user.id) {
    throw ApiError.forbidden("You can only invite people who will report to you");
  }

  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.organizationId, ctx.user.organizationId), eq(roles.key, input.roleKey)))
    .limit(1);
  if (!role) throw ApiError.badRequest("Unknown role for your organization");

  const [existing] = await db
    .select({ id: users.id, organizationId: users.organizationId, status: users.status })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    const [membership] = await db
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, existing.id),
          eq(organizationMemberships.organizationId, ctx.user.organizationId),
        ),
      )
      .limit(1);
    if (membership) {
      throw ApiError.conflict("This person is already a member — ask them to sign in");
    }
    await assertSeatAvailable(ctx);
    await db
      .insert(organizationMemberships)
      .values({ userId: existing.id, organizationId: ctx.user.organizationId })
      .onConflictDoNothing();
    await db.insert(userRoles).values({ userId: existing.id, roleId: role.id, grantedBy: ctx.user.id });
    await db
      .insert(employees)
      .values({
        organizationId: ctx.user.organizationId,
        userId: existing.id,
        jobTitle: "Employee",
        managerUserId,
      })
      .onConflictDoNothing();
    await audit({
      organizationId: ctx.user.organizationId,
      actorUserId: ctx.user.id,
      action: "MEMBERSHIP_LINKED",
      entityType: "user",
      entityId: existing.id,
    });
    void emit(ctx.user.organizationId, "user.invited", "user", existing.id, ctx.user.id, { email }).catch(() => {});
    void import("@/modules/billing/service").then(({ syncSeatsAfterInvite }) =>
      syncSeatsAfterInvite(ctx.user.organizationId),
    );
    return { userId: existing.id, inviteId: existing.id, linked: true };
  }

  await assertSeatAvailable(ctx);
  const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
  const user = first(
    await db
      .insert(users)
      .values({
        organizationId: ctx.user.organizationId,
        email,
        name,
        passwordHash,
        status: "invited",
      })
      .returning({ id: users.id }),
  );
  await db.insert(userRoles).values({ userId: user.id, roleId: role.id });
  await db.insert(organizationMemberships).values({
    userId: user.id,
    organizationId: ctx.user.organizationId,
  });
  await db.insert(employees).values({
    organizationId: ctx.user.organizationId,
    userId: user.id,
    jobTitle: "Employee",
    managerUserId,
  });

  const raw = newSessionToken();
  const [invite] = await db
    .insert(invitationTokens)
    .values({
      organizationId: ctx.user.organizationId,
      tokenHash: hashToken(raw),
      email,
      name,
      roleKey: input.roleKey,
      invitedBy: ctx.user.id,
      managerUserId,
      userId: user.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning({ id: invitationTokens.id });

  const inviteUrl = acceptUrlFor(raw);
  void sendInviteLinkEmail({
    to: email,
    orgName: org.name,
    inviterName: ctx.user.name,
    acceptUrl: inviteUrl,
  }).catch(() => {});

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "USER_INVITED",
    entityType: "user",
    entityId: user.id,
    newValue: { email, roleKey: input.roleKey, via: "token" },
  });
  void emit(ctx.user.organizationId, "user.created", "user", user.id, ctx.user.id, { email }).catch(() => {});
  void import("@/modules/billing/service").then(({ syncSeatsAfterInvite }) =>
    syncSeatsAfterInvite(ctx.user.organizationId),
  );

  return { userId: user.id, inviteId: invite!.id, inviteUrl };
}

export async function peekInvitation(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const [row] = await db
    .select({
      id: invitationTokens.id,
      email: invitationTokens.email,
      name: invitationTokens.name,
      expiresAt: invitationTokens.expiresAt,
      usedAt: invitationTokens.usedAt,
      orgName: organizations.name,
      logoUrl: organizations.logoUrl,
      primaryColor: organizations.primaryColor,
      orgStatus: organizations.status,
    })
    .from(invitationTokens)
    .innerJoin(organizations, eq(organizations.id, invitationTokens.organizationId))
    .where(eq(invitationTokens.tokenHash, tokenHash))
    .limit(1);
  if (!row || row.usedAt || row.expiresAt <= new Date() || row.orgStatus !== "active") {
    throw ApiError.notFound("This invite is invalid or has expired. Ask your admin for a new one.");
  }
  return row;
}

export async function acceptInvitation(
  rawToken: string,
  input: { password: string; ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date; redirect: string }> {
  if (!passwordStrongEnough(input.password)) {
    throw ApiError.badRequest("Choose a stronger password (10+ characters, letters and a number)");
  }
  const tokenHash = hashToken(rawToken);
  const [row] = await db
    .select()
    .from(invitationTokens)
    .where(eq(invitationTokens.tokenHash, tokenHash))
    .limit(1);
  if (!row || row.usedAt || row.expiresAt <= new Date()) {
    throw ApiError.notFound("This invite is invalid or has expired. Ask your admin for a new one.");
  }
  const [org] = await db
    .select({ status: organizations.status, onboardingState: organizations.onboardingState })
    .from(organizations)
    .where(eq(organizations.id, row.organizationId))
    .limit(1);
  if (!org || org.status !== "active") throw ApiError.forbidden("This organization is suspended");

  const passwordHash = await hashPassword(input.password);
  if (row.userId) {
    await db
      .update(users)
      .set({ passwordHash, status: "active", name: row.name })
      .where(eq(users.id, row.userId));
  }
  await db.update(invitationTokens).set({ usedAt: new Date() }).where(eq(invitationTokens.id, row.id));

  const session = await createSession(row.userId!, { ip: input.ip, userAgent: input.userAgent });
  await audit({
    organizationId: row.organizationId,
    actorUserId: row.userId,
    action: "INVITE_ACCEPTED",
    entityType: "user",
    entityId: row.userId,
  });
  const canRunSetup = row.roleKey === "admin" || row.roleKey === "hr_admin";
  const redirect = org.onboardingState !== "complete" && canRunSetup ? "/setup" : "/home";
  return { token: session.token, expiresAt: session.expiresAt, redirect };
}

export async function resendInvitation(ctx: AuthContext, inviteId: string): Promise<{ inviteUrl?: string }> {
  assertCanInvite(ctx);
  const [row] = await db
    .select()
    .from(invitationTokens)
    .where(and(eq(invitationTokens.id, inviteId), eq(invitationTokens.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row || row.usedAt) throw ApiError.notFound("Invite not found");
  if (!canInviteAnyone(ctx) && row.invitedBy !== ctx.user.id) {
    throw ApiError.forbidden("You can only resend your own invites");
  }
  const raw = newSessionToken();
  await db
    .update(invitationTokens)
    .set({ tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + INVITE_TTL_MS) })
    .where(eq(invitationTokens.id, inviteId));
  const inviteUrl = acceptUrlFor(raw);
  void sendInviteLinkEmail({
    to: row.email,
    orgName: ctx.org.name,
    inviterName: ctx.user.name,
    acceptUrl: inviteUrl,
  }).catch(() => {});
  return { inviteUrl };
}

export async function revokeInvitation(ctx: AuthContext, inviteId: string): Promise<void> {
  assertCanInvite(ctx);
  const [row] = await db
    .select()
    .from(invitationTokens)
    .where(and(eq(invitationTokens.id, inviteId), eq(invitationTokens.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound("Invite not found");
  if (!canInviteAnyone(ctx) && row.invitedBy !== ctx.user.id) {
    throw ApiError.forbidden("You can only revoke your own invites");
  }
  await db.delete(invitationTokens).where(eq(invitationTokens.id, inviteId));
  if (row.userId) {
    const [u] = await db.select({ status: users.status }).from(users).where(eq(users.id, row.userId)).limit(1);
    if (u?.status === "invited") {
      await db.delete(users).where(eq(users.id, row.userId));
    }
  }
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "INVITE_REVOKED",
    entityType: "invitation",
    entityId: inviteId,
  });
}

export async function listPendingInvites(ctx: AuthContext) {
  assertCanInvite(ctx);
  const teamOnly = !canInviteAnyone(ctx);
  return db
    .select({
      id: invitationTokens.id,
      email: invitationTokens.email,
      name: invitationTokens.name,
      roleKey: invitationTokens.roleKey,
      expiresAt: invitationTokens.expiresAt,
      createdAt: invitationTokens.createdAt,
    })
    .from(invitationTokens)
    .where(
      and(
        eq(invitationTokens.organizationId, ctx.user.organizationId),
        isNull(invitationTokens.usedAt),
        teamOnly ? eq(invitationTokens.invitedBy, ctx.user.id) : sql`true`,
      ),
    )
    .orderBy(desc(invitationTokens.createdAt));
}

export async function invalidateInvitesForUser(orgId: string, userId: string, email: string): Promise<void> {
  await db
    .delete(invitationTokens)
    .where(and(eq(invitationTokens.organizationId, orgId), eq(invitationTokens.email, email)));
  void userId;
}

export interface ImportRow {
  name: string;
  email: string;
  roleKey: string;
  managerEmail?: string;
}

export function parseInviteCsv(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0]!.toLowerCase();
  const start = header.includes("email") ? 1 : 0;
  const rows: ImportRow[] = [];
  for (const line of lines.slice(start)) {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const [name, email, roleKey, managerEmail] = cols;
    if (!email) continue;
    rows.push({
      name: name || email.split("@")[0] || "Member",
      email: email.toLowerCase(),
      roleKey: (roleKey || "employee").toLowerCase(),
      managerEmail: managerEmail?.toLowerCase() || undefined,
    });
  }
  return rows.slice(0, 1000);
}

export async function previewImport(ctx: AuthContext, rows: ImportRow[]) {
  if (!canInviteAnyone(ctx)) throw ApiError.forbidden("Missing permission: users.manage");
  const [org] = await db
    .select({ allowedEmailDomains: organizations.allowedEmailDomains })
    .from(organizations)
    .where(eq(organizations.id, ctx.user.organizationId))
    .limit(1);
  const existing = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.organizationId, ctx.user.organizationId));
  const byEmail = new Map(existing.map((u) => [u.email, u.name]));
  const errors: { row: number; email: string; error: string }[] = [];
  const preview: { name: string; email: string; roleKey: string; managerEmail: string | null }[] = [];
  rows.forEach((r, i) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
      errors.push({ row: i + 1, email: r.email, error: "Invalid email" });
      return;
    }
    if (byEmail.has(r.email)) {
      errors.push({ row: i + 1, email: r.email, error: "Already a member" });
      return;
    }
    if (!emailAllowedForDomains(r.email, org?.allowedEmailDomains)) {
      errors.push({ row: i + 1, email: r.email, error: "Email domain not allowed" });
      return;
    }
    if (r.managerEmail && !byEmail.has(r.managerEmail) && !rows.some((x) => x.email === r.managerEmail)) {
      errors.push({ row: i + 1, email: r.email, error: `Unknown manager ${r.managerEmail}` });
      return;
    }
    preview.push({
      name: r.name,
      email: r.email,
      roleKey: r.roleKey,
      managerEmail: r.managerEmail ?? null,
    });
  });
  return { preview, errors, count: rows.length };
}

export async function commitImport(ctx: AuthContext, rows: ImportRow[]) {
  const { preview, errors } = await previewImport(ctx, rows);
  if (errors.length) throw ApiError.badRequest("Fix the highlighted rows before committing", { errors });
  const created: { email: string; userId: string }[] = [];
  for (const row of preview) {
    let managerUserId: string | undefined;
    if (row.managerEmail) {
      const [m] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.organizationId, ctx.user.organizationId), eq(users.email, row.managerEmail)))
        .limit(1);
      managerUserId = m?.id;
    }
    const r = await createInvitation(ctx, {
      name: row.name,
      email: row.email,
      roleKey: row.roleKey,
      managerUserId,
    });
    created.push({ email: row.email, userId: r.userId });
  }
  return { created: created.length };
}

export function inviteScope(ctx: AuthContext): "company" | "team" | null {
  if (canInviteAnyone(ctx)) return "company";
  if (can(ctx.access, "team.invite")) return "team";
  return null;
}
