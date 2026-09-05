/**
 * Tenant administration: users, role assignment, permission overrides.
 * Every lookup re-verifies organization membership — an admin can only ever
 * touch rows inside their own tenant.
 */
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db, first } from "@/lib/db";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { ApiError } from "@/lib/errors";
import { hashPassword } from "@/lib/password";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { AuthContext } from "@/lib/session";
import { assertSeatAvailable } from "@/modules/billing/service";
import { sendInviteEmail } from "@/lib/mail/activation";
import {
  employees,
  organizationMemberships,
  roles,
  userPermissionOverrides,
  userRoles,
  users,
} from "@/db/schema";
import {
  ALL_PERMISSIONS,
  SCOPES,
  type PermissionScope,
} from "@/modules/iam/catalog";

// ---------- users ----------

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  status: string;
  lastLoginAt: Date | null;
  roles: { id: string; key: string; name: string }[];
}

export async function listUsersWithRoles(ctx: AuthContext): Promise<AdminUserRow[]> {
  const orgId = ctx.user.organizationId;
  const [userRows, roleRows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.organizationId, orgId))
      .orderBy(asc(users.name)),
    db
      .select({
        userId: userRoles.userId,
        roleId: roles.id,
        roleKey: roles.key,
        roleName: roles.name,
      })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(roles.organizationId, orgId)),
  ]);

  const byUser = new Map<string, AdminUserRow["roles"]>();
  for (const r of roleRows) {
    const list = byUser.get(r.userId) ?? [];
    list.push({ id: r.roleId, key: r.roleKey, name: r.roleName });
    byUser.set(r.userId, list);
  }
  return userRows.map((u) => ({ ...u, roles: byUser.get(u.id) ?? [] }));
}

export async function inviteUser(
  ctx: AuthContext,
  input: { name: string; email: string; roleKey: string; legacy?: boolean; managerUserId?: string },
): Promise<{ userId: string; tempPassword?: string; linked?: boolean; inviteUrl?: string; inviteId?: string }> {
  if (!input.legacy) {
    const { createInvitation } = await import("@/modules/invitations/service");
    return createInvitation(ctx, input);
  }
  const email = input.email.trim().toLowerCase();

  // Phase F: invite-spam guard — shared per-org window (email fan-out makes
  // abuse expensive); default 100 invites/hour/org, env-tunable.
  await enforceRateLimit("org", `invite:${ctx.user.organizationId}`, {
    limit: Number(process.env.INVITE_RATE_LIMIT_PER_HOUR ?? 100),
    windowSeconds: 3600,
  });

  // Seat enforcement: adding anyone (new invite or existing identity) must fit
  // the organization's plan limit.
  await assertSeatAvailable(ctx);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.organizationId, ctx.user.organizationId), eq(roles.key, input.roleKey)))
    .limit(1);
  if (!role) throw ApiError.badRequest("Unknown role for your organization");

  // R2 §21 — existing global identity joins this tenant as a new membership
  if (existing) {
    await db
      .insert(organizationMemberships)
      .values({ userId: existing.id, organizationId: ctx.user.organizationId })
      .onConflictDoNothing();
    await db.insert(userRoles).values({ userId: existing.id, roleId: role.id, grantedBy: ctx.user.id });
    await db.insert(employees).values({
      organizationId: ctx.user.organizationId,
      userId: existing.id,
      jobTitle: "Employee",
      managerUserId: ctx.user.id,
    });
    await audit({
      organizationId: ctx.user.organizationId,
      actorUserId: ctx.user.id,
      action: "MEMBERSHIP_LINKED",
      entityType: "user",
      entityId: existing.id,
    });
    void emit(ctx.user.organizationId, "user.invited", "user", existing.id, ctx.user.id, { email }).catch(() => {});
    return { userId: existing.id, linked: true };
  }

  // ponytail: temp password shown once to the inviting admin — SMTP invite flow comes with notifications phase
  const tempPassword = randomBytes(12).toString("base64url");
  const passwordHash = await hashPassword(tempPassword);

  const user = first(
    await db
      .insert(users)
      .values({
        organizationId: ctx.user.organizationId,
        email,
        name: input.name.trim(),
        passwordHash,
        status: "active",
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
    managerUserId: ctx.user.id,
  });

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "USER_INVITED",
    entityType: "user",
    entityId: user.id,
    newValue: { email, roleKey: input.roleKey },
  });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ROLE_ASSIGNED",
    entityType: "user",
    entityId: user.id,
    newValue: { roleKey: input.roleKey },
  });

  // Activation (Phase A): email the invitee their one-time password when SMTP
  // is configured; otherwise the admin sees it inline and shares it manually.
  void sendInviteEmail({
    to: email,
    orgName: ctx.org.name,
    inviterName: ctx.user.name,
    tempPassword,
  }).catch(() => {});

  // Phase C: fan the provisioning event out to the org's webhooks.
  void emit(ctx.user.organizationId, "user.created", "user", user.id, ctx.user.id, { email }).catch(() => {});

  return { userId: user.id, tempPassword };
}

async function requireOrgUser(ctx: AuthContext, userId: string): Promise<void> {
  if (userId === ctx.user.id) throw ApiError.badRequest("You cannot change your own access here");
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound(); // not in this tenant → indistinguishable from missing
}

export async function assignRole(ctx: AuthContext, userId: string, roleId: string): Promise<void> {
  await requireOrgUser(ctx, userId);
  const [role] = await db
    .select({ key: roles.key })
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!role) throw ApiError.badRequest("Unknown role for your organization");

  await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ROLE_ASSIGNED",
    entityType: "user",
    entityId: userId,
    newValue: { roleId },
  });
}

export async function removeRole(ctx: AuthContext, userId: string, roleId: string): Promise<void> {
  await requireOrgUser(ctx, userId);
  const [role] = await db
    .select({ key: roles.key })
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!role) throw ApiError.badRequest("Unknown role for your organization");

  await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));

  // safety net: a user must never end up with zero roles
  const remaining = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
    .limit(1);
  if (!remaining[0]) {
    const [fallback] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.organizationId, ctx.user.organizationId), eq(roles.key, "employee")))
      .limit(1);
    if (fallback) {
      await db.insert(userRoles).values({ userId, roleId: fallback.id });
    }
  }

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ROLE_REMOVED",
    entityType: "user",
    entityId: userId,
    oldValue: { roleId },
  });
}

// ---------- overrides (temporary/direct permissions) ----------

export interface OverrideRow {
  id: string;
  userId: string;
  userName: string;
  permission: string;
  effect: "allow" | "deny";
  scope: PermissionScope;
  reason: string;
  expiresAt: Date | null;
  createdAt: Date;
}

export async function listOverrides(ctx: AuthContext): Promise<OverrideRow[]> {
  return (
    db
      .select({
        id: userPermissionOverrides.id,
        userId: userPermissionOverrides.userId,
        userName: users.name,
        permission: userPermissionOverrides.permission,
        effect: userPermissionOverrides.effect,
        scope: userPermissionOverrides.scope,
        reason: userPermissionOverrides.reason,
        expiresAt: userPermissionOverrides.expiresAt,
        createdAt: userPermissionOverrides.createdAt,
      })
      .from(userPermissionOverrides)
      .innerJoin(users, eq(users.id, userPermissionOverrides.userId))
      .where(eq(userPermissionOverrides.organizationId, ctx.user.organizationId))
      .orderBy(desc(userPermissionOverrides.createdAt))
      .limit(200)
  );
}

export async function addOverride(
  ctx: AuthContext,
  input: {
    userId: string;
    permission: string;
    effect: "allow" | "deny";
    scope: PermissionScope;
    expiresAt?: string | null;
    reason: string;
  },
): Promise<void> {
  if (!ALL_PERMISSIONS.includes(input.permission)) {
    throw ApiError.badRequest("Unknown permission");
  }
  if (!SCOPES.includes(input.scope)) throw ApiError.badRequest("Unknown scope");
  let expiry: Date | null = null;
  if (input.expiresAt) {
    expiry = new Date(input.expiresAt);
    if (Number.isNaN(+expiry) || expiry <= new Date()) {
      throw ApiError.badRequest("Expiry must be in the future");
    }
  }

  await requireOrgUser(ctx, input.userId);

  await db.insert(userPermissionOverrides).values({
    organizationId: ctx.user.organizationId,
    userId: input.userId,
    permission: input.permission,
    effect: input.effect,
    scope: input.scope,
    reason: input.reason.trim(),
    grantedBy: ctx.user.id,
    expiresAt: expiry,
  });

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: input.effect === "deny" ? "PERMISSION_DENIED" : "PERMISSION_GRANTED",
    entityType: "permission_override",
    entityId: input.userId,
    newValue: {
      permission: input.permission,
      scope: input.scope,
      expiresAt: expiry?.toISOString() ?? null,
      reason: input.reason,
    },
  });
}

export async function removeOverride(ctx: AuthContext, overrideId: string): Promise<void> {
  const [row] = await db
    .select({ id: userPermissionOverrides.id, userId: userPermissionOverrides.userId, permission: userPermissionOverrides.permission })
    .from(userPermissionOverrides)
    .where(
      and(
        eq(userPermissionOverrides.id, overrideId),
        eq(userPermissionOverrides.organizationId, ctx.user.organizationId),
      ),
    )
    .limit(1);
  if (!row) throw ApiError.notFound();

  await db.delete(userPermissionOverrides).where(eq(userPermissionOverrides.id, overrideId));
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "PERMISSION_REVOKED",
    entityType: "permission_override",
    entityId: row.userId,
    oldValue: { overrideId, permission: row.permission },
  });
}

/** Roles available to this tenant (for pickers). */
export async function listTenantRoles(ctx: AuthContext) {
  return db
    .select({ id: roles.id, key: roles.key, name: roles.name })
    .from(roles)
    .where(and(eq(roles.organizationId, ctx.user.organizationId), eq(roles.isSystem, true)))
    .orderBy(asc(roles.name));
}

// ---------- access reviews (blueprint §58) ----------

/**
 * Record a "reviewed and kept" decision. Revocations go through
 * removeRole/removeOverride, which carry their own stronger audits.
 */
export async function logReviewKeep(
  ctx: AuthContext,
  item: { kind: "override" | "role"; refId: string; userName: string; detail: string },
): Promise<void> {
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ACCESS_REVIEWED",
    entityType: "access_review",
    entityId: item.refId,
    metadata: { kind: item.kind, user: item.userName, detail: item.detail, decision: "kept" },
  });
}

// ---------- D9: admin home / user detail / lifecycle / sessions ----------

import { ilike, inArray, or } from "drizzle-orm";
import {
  auditLogs,
  departments,
  sessions,
} from "@/db/schema";

function orgAuditWhere(ctx: AuthContext) {
  // tenant events only; platform-level rows (NULL org) stay behind platform.admin
  return eq(auditLogs.organizationId, ctx.user.organizationId);
}

/** Compact numbers for the Admin Home overview + attention lists. */
export async function getAdminOverview(ctx: AuthContext) {
  const orgId = ctx.user.organizationId;
  const [userStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${users.status} = 'active')::int`,
      suspended: sql<number>`count(*) filter (where ${users.status} = 'suspended')::int`,
      mfaEnabled: sql<number>`count(*) filter (where ${users.totpEnabled})::int`,
    })
    .from(users)
    .where(eq(users.organizationId, orgId));

  const [sessionStats] = await db
    .select({
      activeSessions: sql<number>`count(*) filter (where ${sessions.expiresAt} > now())::int`,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(users.organizationId, orgId));

  const [roleStats] = await db
    .select({ total: sql<number>`count(distinct ${roles.id})::int` })
    .from(roles)
    .where(eq(roles.organizationId, orgId));

  const recentActivity = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      actorName: users.name,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(orgAuditWhere(ctx))
    .orderBy(desc(auditLogs.createdAt))
    .limit(10);

  const overrides = await listOverrides(ctx);
  const activeOverrides = overrides.filter((o) => !o.expiresAt || o.expiresAt > new Date());

  return {
    users: userStats ?? { total: 0, active: 0, suspended: 0, mfaEnabled: 0 },
    activeSessions: sessionStats?.activeSessions ?? 0,
    roles: roleStats?.total ?? 0,
    activeOverrides: activeOverrides.length,
    expiringOverrides: overrides.filter(
      (o) => o.expiresAt && o.expiresAt > new Date() && o.expiresAt < new Date(Date.now() + 7 * 86_400_000),
    ).length,
    recentActivity,
  };
}

/** Full user detail for the admin User Detail screen. */
export async function getUserDetail(ctx: AuthContext, userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      totpEnabled: users.totpEnabled,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!user) throw ApiError.notFound();

  const [userRoleRows, employeeRows, activeSessions, activity] = await Promise.all([
    db
      .select({ id: roles.id, key: roles.key, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId)),
    db
      .select({
        jobTitle: employees.jobTitle,
        deptName: departments.name,
      })
      .from(employees)
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .where(and(eq(employees.userId, userId), eq(employees.organizationId, ctx.user.organizationId)))
      .limit(1),
    db
      .select({
        id: sessions.id,
        ip: sessions.ip,
        userAgent: sessions.userAgent,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt))
      .limit(20),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(and(orgAuditWhere(ctx), eq(auditLogs.actorUserId, userId)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(15),
  ]);

  const employee = employeeRows[0] ?? null;
  const now = new Date();
  return {
    ...user,
    roles: userRoleRows,
    department: employee?.deptName ?? null,
    jobTitle: employee?.jobTitle ?? null,
    sessions: activeSessions.map((s) => ({ ...s, expired: s.expiresAt <= now })),
    activity,
  };
}

const LIFECYCLE_STATUSES = new Set(["active", "suspended"]);

/** Lifecycle transition with mandatory audit; suspending revokes all sessions. */
export async function setUserStatus(
  ctx: AuthContext,
  userId: string,
  status: "active" | "suspended",
): Promise<void> {
  if (!LIFECYCLE_STATUSES.has(status)) throw ApiError.badRequest("Unsupported status");
  await requireOrgUser(ctx, userId);

  const [updated] = await db
    .update(users)
    .set({ status })
    .where(and(eq(users.id, userId), eq(users.organizationId, ctx.user.organizationId)))
    .returning({ id: users.id });
  if (!updated) throw ApiError.notFound();

  let revokedSessions = 0;
  if (status === "suspended") {
    // offboarding step: access gone ⇒ live sessions die immediately
    const deleted = await db.delete(sessions).where(eq(sessions.userId, userId)).returning({ id: sessions.id });
    revokedSessions = deleted.length;
    const [gone] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (gone) {
      const { invalidateInvitesForUser } = await import("@/modules/invitations/service");
      await invalidateInvitesForUser(ctx.user.organizationId, userId, gone.email);
    }
    // record the departure date once — analytics attrition source
    await db
      .update(employees)
      .set({ leftAt: sql`COALESCE(${employees.leftAt}, CURRENT_DATE)` })
      .where(and(eq(employees.userId, userId), eq(employees.organizationId, ctx.user.organizationId)));
  } else if (status === "active") {
    // reinstated: clear the departure marker
    await db
      .update(employees)
      .set({ leftAt: null })
      .where(and(eq(employees.userId, userId), eq(employees.organizationId, ctx.user.organizationId)));
  }

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: status === "suspended" ? "USER_SUSPENDED" : "USER_REACTIVATED",
    entityType: "user",
    entityId: userId,
    newValue: { status, revokedSessions },
  });
}

async function requireOrgSession(ctx: AuthContext, sessionId: string) {
  const [row] = await db
    .select({ id: sessions.id, userId: sessions.userId })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), eq(users.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  return row;
}

/** Revoke one session of any user in this tenant. */
export async function revokeSession(ctx: AuthContext, sessionId: string): Promise<void> {
  const row = await requireOrgSession(ctx, sessionId);
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "SESSION_REVOKED",
    entityType: "session",
    entityId: sessionId,
    metadata: { sessionUserId: row.userId },
  });
}

/** Revoke every live session for a user in this tenant. */
export async function revokeUserSessions(ctx: AuthContext, userId: string): Promise<number> {
  await requireOrgUser(ctx, userId);
  const deleted = await db.delete(sessions).where(eq(sessions.userId, userId)).returning({ id: sessions.id });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "SESSIONS_REVOKED_ALL",
    entityType: "user",
    entityId: userId,
    newValue: { revoked: deleted.length },
  });
  return deleted.length;
}

/** All sessions in the tenant, newest first (Security Center table). */
export async function listOrgSessions(ctx: AuthContext) {
  const rows = await db
    .select({
      id: sessions.id,
      userName: users.name,
      userId: users.id,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(users.organizationId, ctx.user.organizationId))
    .orderBy(desc(sessions.createdAt))
    .limit(200);
  const now = new Date();
  return rows.map((s) => ({ ...s, expired: s.expiresAt <= now }));
}

/** Filterable central audit trail (§44–46): q/action/actor filters, paged. */
export async function listAuditLogs(
  ctx: AuthContext,
  opts: { q?: string; action?: string; actorId?: string; limit?: number; since?: Date } = {},
) {
  const conditions = [orgAuditWhere(ctx)];
  if (opts.q) {
    const like = `%${opts.q.replace(/[%_]/g, "")}%`;
    conditions.push(
      or(
        ilike(auditLogs.action, like),
        ilike(auditLogs.entityType, like),
        ilike(auditLogs.entityId, like),
      )!,
    );
  }
  if (opts.action) {
    const actions = opts.action
      .split(",")
      .map((a) => a.trim().toUpperCase())
      .filter(Boolean);
    if (actions.length === 1) conditions.push(eq(auditLogs.action, actions[0]!));
    else if (actions.length > 1) conditions.push(inArray(auditLogs.action, actions));
  }
  if (opts.actorId) conditions.push(eq(auditLogs.actorUserId, opts.actorId));
  if (opts.since) conditions.push(sql`${auditLogs.createdAt} >= ${opts.since.toISOString()}`);

  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      oldValue: auditLogs.oldValue,
      newValue: auditLogs.newValue,
      metadata: auditLogs.metadata,
      ip: auditLogs.ip,
      actorName: users.name,
      actorId: auditLogs.actorUserId,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(opts.limit ?? 50, 200));
}

/** Roles with member counts for the Role List screen. */
export async function listRolesWithCounts(ctx: AuthContext) {
  return db
    .select({
      id: roles.id,
      key: roles.key,
      name: roles.name,
      description: roles.description,
      isSystem: roles.isSystem,
      members: sql<number>`(SELECT count(*)::int FROM user_roles ur WHERE ur.role_id = ${roles.id})`,
    })
    .from(roles)
    .where(eq(roles.organizationId, ctx.user.organizationId))
    .orderBy(asc(roles.name));
}

/** Role detail: permission bundle + holders (§27). */
export async function getRoleDetail(ctx: AuthContext, roleId: string) {
  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!role) throw ApiError.notFound();

  const permissionRows = await db.execute(
    sql`SELECT rp.permission, rp.scope::text AS scope FROM role_permissions rp WHERE rp.role_id = ${roleId} ORDER BY rp.permission`,
  );

  const holders = await db
    .select({ id: users.id, name: users.name, email: users.email, status: users.status })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(eq(userRoles.roleId, roleId))
    .orderBy(asc(users.name))
    .limit(200);

  return { role, permissions: permissionRows.rows as unknown as { permission: string; scope: string }[], holders };
}
