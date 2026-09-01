/**
 * Platform administration (blueprint §1K): tenant registry + lifecycle.
 * Gated by the GLOBAL-scope platform.admin permission held only by the
 * Platform Super Admin role. Platform operators see tenant metadata, never
 * tenant business data.
 */
import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { can } from "@/modules/iam/engine";
import { organizations } from "@/db/schema";

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  userCount: number;
  createdAt: Date;
}

export async function listTenants(ctx: AuthContext): Promise<TenantRow[]> {
  if (!canPlatform(ctx)) throw ApiError.forbidden("Missing permission: platform.admin");
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      status: organizations.status,
      createdAt: organizations.createdAt,
      userCount: sql<number>`(SELECT count(*)::int FROM users u WHERE u.organization_id = ${organizations.id})`,
    })
    .from(organizations)
    .where(sql`${organizations.slug} <> '__platform'`)
    .orderBy(asc(organizations.createdAt));
  return rows.map((r) => ({ ...r, userCount: Number(r.userCount) }));
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
