import { and, asc, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { db, pool } from "./db";
import { env } from "./env";
import { ApiError } from "./errors";
import { hashToken, newSessionToken } from "./password";

import {
  organizations,
  rolePermissions,
  roles,
  sessions,
  userPermissionOverrides,
  userRoles,
  users,
} from "@/db/schema";
import { computeEffectiveAccess, type EffectiveAccess, type Grant, type Override } from "@/modules/iam/engine";

export const SESSION_COOKIE = "wamiro_session";
const SESSION_TTL_DAYS = 14;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  status: "invited" | "active" | "suspended";
  organizationId: string;
  totpEnabled: boolean;
}

export interface SessionOrg {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  modules: Record<string, boolean>;
  plan: string;
  billingStatus: string;
  trialEndsAt: Date | null;
  seatLimit: number | null;
  onboardingState: string;
  mfaMode: string;
}

export interface AuthContext {
  user: SessionUser;
  org: SessionOrg;
  roleKeys: string[];
  roleNames: string[];
  access: EffectiveAccess;
}

// ---------- creation / destruction ----------

export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });
  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** R2 §8: organizations this identity belongs to (for the switcher). */
export async function listMemberships(userId: string) {
  const { organizationMemberships } = await import("@/db/schema");
  return db
    .select({
      organizationId: organizationMemberships.organizationId,
      name: organizations.name,
      logoUrl: organizations.logoUrl,
      status: organizationMemberships.status,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(eq(organizationMemberships.userId, userId))
    .orderBy(asc(organizations.name));
}

/** R2 §11: switch tenant for THIS session only; validates membership server-side. */
export async function switchMembership(token: string, userId: string, organizationId: string): Promise<boolean> {
  const { organizationMemberships } = await import("@/db/schema");
  const [m] = await db
    .select({ status: organizationMemberships.status })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, "active"),
      ),
    )
    .limit(1);
  if (!m) return false;
  await db
    .update(sessions)
    .set({ activeOrganizationId: organizationId })
    .where(eq(sessions.tokenHash, hashToken(token)));
  return true;
}

export function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true as const,
    secure: env.isProd,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export function tokenFromRequest(req: NextRequest): string | null {
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}

// ---------- loading ----------

/**
 * Load the full auth context server-side. The tenant is derived ONLY from
 * the session row — client-supplied organization ids are never trusted
 * (blueprint §17). Every tenant-scoped query in every module takes
 * ctx.user.organizationId as its filter.
 */
export async function loadAuthContext(token: string): Promise<AuthContext> {
  const [row] = await db
    .select({
      user: {
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        totpEnabled: users.totpEnabled,
        organizationId: sql<string>`COALESCE(${sessions.activeOrganizationId}, ${users.organizationId})`,
      },
      org: {
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        status: organizations.status,
        logoUrl: organizations.logoUrl,
        primaryColor: organizations.primaryColor,
        secondaryColor: organizations.secondaryColor,
        modules: organizations.modules,
        plan: organizations.plan,
        billingStatus: organizations.billingStatus,
        trialEndsAt: organizations.trialEndsAt,
        seatLimit: organizations.seatLimit,
        onboardingState: organizations.onboardingState,
        mfaMode: organizations.mfaMode,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(
      organizations,
      sql`${organizations.id} = COALESCE(${sessions.activeOrganizationId}, ${users.organizationId})`,
    )
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) throw ApiError.unauthorized("Session expired or invalid");
  if (row.user.status === "suspended") {
    throw ApiError.forbidden("This account is suspended");
  }
  if (row.user.status === "invited") {
    throw ApiError.forbidden("Finish the invite link to activate this account");
  }
  if (row.org.status !== "active") {
    throw ApiError.forbidden("This organization is suspended");
  }
  // Subscription gate: cancelled orgs lose access (like suspension). past_due
  // stays usable so dunning UX can surface before a hard stop.
  if (row.org.billingStatus === "cancelled") {
    throw ApiError.forbidden("This organization's subscription has ended. Contact support to reactivate.");
  }
  // Throttled activity stamp (activation analytics). One UPDATE at most every
  // five minutes per user — the WHERE clause makes the write cheap and safe
  // to fire on every request without a pre-read.
  void db
    .update(users)
    .set({ lastActiveAt: new Date() })
    .where(and(eq(users.id, row.user.id), sql`(${users.lastActiveAt} IS NULL OR ${users.lastActiveAt} < now() - interval '5 minutes')`))
    .catch(() => {});

  const [grantRows, overrideRows, roleRows] = await Promise.all([
    db
      .select({
        permission: rolePermissions.permission,
        scope: rolePermissions.scope,
      })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .where(eq(userRoles.userId, row.user.id)),
    db
      .select({
        permission: userPermissionOverrides.permission,
        effect: userPermissionOverrides.effect,
        scope: userPermissionOverrides.scope,
        expiresAt: userPermissionOverrides.expiresAt,
      })
      .from(userPermissionOverrides)
      .where(eq(userPermissionOverrides.userId, row.user.id)),
    db
      .select({ key: roles.key, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, row.user.id)),
  ]);

  const grants: Grant[] = grantRows.map((g) => ({
    permission: g.permission,
    scope: g.scope,
  }));

  const overrides: Override[] = overrideRows.map((o) => ({
    permission: o.permission,
    effect: o.effect,
    scope: o.scope,
    expiresAt: o.expiresAt,
  }));

  return {
    user: row.user,
    org: row.org,
    access: computeEffectiveAccess(grants, overrides),
    roleKeys: roleRows.map((r) => r.key),
    roleNames: roleRows.map((r) => r.name),
  };
}

/** Ensure the pool is reachable — used by health checks. */
export async function pingDb(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
