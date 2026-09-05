/**
 * Platform administration (blueprint §1K): tenant registry + lifecycle.
 * Gated by the GLOBAL-scope platform.admin permission held only by the
 * Platform Super Admin role. Platform operators see tenant metadata, never
 * tenant business data.
 */
import { and, asc, count, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { can } from "@/modules/iam/engine";
import { effectiveSeatLimit } from "@/modules/billing/plans";
import { organizations, organizationMemberships, users } from "@/db/schema";

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  plan: string;
  billingStatus: string;
  trialEndsAt: Date | null;
  seatLimit: number | null;
  userCount: number;
  seatCount: number;
  lastActiveAt: Date | null;
  createdAt: Date;
}

export interface PlatformStats {
  totalTenants: number;
  activeSeats: number;
  byPlan: { plan: string; count: number }[];
  trialsEndingSoon: number; // trial orgs expiring within 7 days
  /** Distinct users active in the last 7 days (activation KPI). */
  usersActive7d: number;
  /** Companies with at least one active user in the last 7 days. */
  companiesActive7d: number;
}

export async function listTenants(ctx: AuthContext): Promise<TenantRow[]> {
  if (!canPlatform(ctx)) throw ApiError.forbidden("Missing permission: platform.admin");
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      status: organizations.status,
      plan: organizations.plan,
      billingStatus: organizations.billingStatus,
      trialEndsAt: organizations.trialEndsAt,
      seatLimit: organizations.seatLimit,
      createdAt: organizations.createdAt,
      userCount: sql<number>`(SELECT count(*)::int FROM users u WHERE u.organization_id = ${organizations.id})`,
      seatCount: sql<number>`(SELECT count(*)::int FROM organization_memberships m WHERE m.organization_id = ${organizations.id} AND m.status = 'active')`,
      lastActiveAt: sql<Date | null>`(SELECT max(u.last_active_at) FROM users u WHERE u.organization_id = ${organizations.id})`,
    })
    .from(organizations)
    .where(sql`${organizations.slug} <> '__platform'`)
    .orderBy(asc(organizations.createdAt));
  return rows.map((r) => ({ ...r, userCount: Number(r.userCount), seatCount: Number(r.seatCount) }));
}

/** Fleet-wide KPIs for the platform console (tenant count, seats, plans, trials). */
export async function platformStats(ctx: AuthContext): Promise<PlatformStats> {
  if (!canPlatform(ctx)) throw ApiError.forbidden("Missing permission: platform.admin");
  const scope = sql`${organizations.slug} <> '__platform'`;
  const since7d = new Date(Date.now() - 7 * 86_400_000);
  const [tenants, seats, byPlan, trials, activeUsers, activeCompanies] = await Promise.all([
    db
      .select({ n: count() })
      .from(organizations)
      .where(and(scope, eq(organizations.status, "active"))),
    db
      .select({ n: count() })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
      .where(and(scope, eq(organizationMemberships.status, "active"))),
    db
      .select({ plan: organizations.plan, count: count() })
      .from(organizations)
      .where(scope)
      .groupBy(organizations.plan),
    db
      .select({ n: count() })
      .from(organizations)
      .where(
        and(
          scope,
          eq(organizations.billingStatus, "trial"),
          sql`${organizations.trialEndsAt} < ${new Date(Date.now() + 7 * 86_400_000)}`,
        ),
      ),
    db.select({ n: count() }).from(users).where(sql`${users.lastActiveAt} >= ${since7d}`),
    db
      .select({ orgId: users.organizationId, n: count() })
      .from(users)
      .where(sql`${users.lastActiveAt} >= ${since7d}`)
      .groupBy(users.organizationId),
  ]);
  return {
    totalTenants: Number(tenants[0]?.n ?? 0),
    activeSeats: Number(seats[0]?.n ?? 0),
    byPlan: byPlan.map((r) => ({ plan: r.plan, count: Number(r.count) })),
    trialsEndingSoon: Number(trials[0]?.n ?? 0),
    usersActive7d: Number(activeUsers[0]?.n ?? 0),
    companiesActive7d: activeCompanies.length,
  };
}

/** Effective seat cap for a tenant row (override ?? plan default). */
export function tenantSeatLimit(row: Pick<TenantRow, "plan" | "seatLimit">): number | null {
  return effectiveSeatLimit(row.plan, row.seatLimit);
}

export async function setTenantStatus(
  ctx: AuthContext,
  orgId: string,
  status: "active" | "suspended",
): Promise<void> {
  if (!canPlatform(ctx)) throw ApiError.forbidden("Missing permission: platform.admin");
  if (orgId === ctx.user.organizationId) {
    throw ApiError.badRequest("You cannot suspend your own organization");
  }
  const updated = await db
    .update(organizations)
    .set({ status, updatedAt: new Date() })
    .where(eq(organizations.id, orgId))
    .returning({ id: organizations.id, name: organizations.name });
  if (!updated[0]) throw ApiError.notFound();

  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: status === "suspended" ? "ORG_SUSPENDED" : "ORG_REACTIVATED",
    entityType: "organization",
    entityId: orgId,
    newValue: { name: updated[0].name, status },
  });
}

function canPlatform(ctx: AuthContext): boolean {
  return can(ctx.access, "platform.admin");
}
