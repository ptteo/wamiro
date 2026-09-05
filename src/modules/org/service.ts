import { and, eq, sql } from "drizzle-orm";

import { db, first } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import {
  departments,
  organizations,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "@/db/schema";
import { PLATFORM_SUPER_ADMIN, SYSTEM_ROLES } from "@/modules/iam/catalog";
import {
  leaveTypes,
  employees,
  organizationMemberships,
  serviceItems,
  announcements,
  knowledgeArticles,
} from "@/db/schema";

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org"
  );
}

export interface SetupStep {
  key: string;
  label: string;
  href: string;
  done: boolean;
}

/**
 * Company setup checklist — drives the admin's onboarding-to-first-value.
 * Measured server-side; each step deep-links to the page that completes it.
 * The home page shows this until every step is done.
 */
export async function setupChecklist(ctx: AuthContext): Promise<{ done: number; total: number; steps: SetupStep[] }> {
  const orgId = ctx.user.organizationId;
  const [memberCount, branding, announceCount, kbCount] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(organizationMemberships)
      .where(and(eq(organizationMemberships.organizationId, orgId), eq(organizationMemberships.status, "active"))),
    db.select({ logoUrl: organizations.logoUrl }).from(organizations).where(eq(organizations.id, orgId)).limit(1),
    db.select({ n: sql<number>`count(*)::int` }).from(announcements).where(eq(announcements.organizationId, orgId)),
    db.select({ n: sql<number>`count(*)::int` }).from(knowledgeArticles).where(eq(knowledgeArticles.organizationId, orgId)),
  ]);
  const steps: SetupStep[] = [
    {
      key: "team",
      label: "Invite your team",
      href: "/admin/users",
      done: Number(memberCount[0]?.n ?? 0) >= 2,
    },
    {
      key: "brand",
      label: "Add your company logo",
      href: "/settings/organization",
      done: Boolean(branding[0]?.logoUrl),
    },
    {
      key: "announce",
      label: "Post your first announcement",
      href: "/announcements",
      done: Number(announceCount[0]?.n ?? 0) >= 1,
    },
    {
      key: "kb",
      label: "Create a knowledge article",
      href: "/knowledge",
      done: Number(kbCount[0]?.n ?? 0) >= 1,
    },
  ];
  return { done: steps.filter((s) => s.done).length, total: steps.length, steps };
}

export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const existing = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, candidate))
      .limit(1);
    if (!existing[0]) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export interface ProvisionOrgInput {
  companyName: string;
  adminName: string;
  adminEmail: string;
  adminPasswordHash: string;
}

/**
 * Permanently delete a tenant and all of its data.
 *
 * Every table except `users` cascades from `organizations.id` (see schema.ts),
 * so the safe order is: delete the org's users first (sessions cascade from
 * users), then the organization row itself, which sweeps the rest. The audit
 * trail has no cascade and survives as a platform-level event.
 *
 * Requires an exact-match typed confirmation (`confirm` === org name) as a
 * hard guard against accidental deletion.
 */
export async function deleteOrganization(ctx: AuthContext, confirm: string): Promise<{ deleted: string }> {
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, ctx.user.organizationId))
    .limit(1);
  if (!org) throw ApiError.notFound("Organization not found");
  if (confirm.trim() !== org.name) {
    throw ApiError.badRequest(`Type \"${org.name}\" exactly to confirm deletion`);
  }

  await db.transaction(async (tx) => {
    // Sessions cascade from users; other tenant tables cascade from organizations.
    await tx.delete(users).where(eq(users.organizationId, org.id));
    await tx.delete(organizations).where(eq(organizations.id, org.id));
  });

  await audit({
    organizationId: null, // survives after the tenant is gone
    actorUserId: ctx.user.id,
    action: "ORG_DELETED",
    entityType: "organization",
    entityId: org.id,
    metadata: { name: org.name, slug: org.slug },
  });

  return { deleted: org.id };
}

/**
 * Create a tenant + its system roles + the first admin, atomically.
 * This is the seed of the tenant isolation boundary: everything else keys
 * off organization_id created here.
 */
export async function provisionOrganization(input: ProvisionOrgInput): Promise<{
  orgId: string;
  userId: string;
}> {
  const slug = await uniqueSlug(input.companyName);

  return db.transaction(async (tx) => {
    const org = first(
      await tx
        .insert(organizations)
        .values({ name: input.companyName.trim(), slug, onboardingState: "pending" })
        .returning({ id: organizations.id }),
    );

    const user = first(
      await tx
        .insert(users)
        .values({
          organizationId: org.id,
          email: input.adminEmail.trim().toLowerCase(),
          passwordHash: input.adminPasswordHash,
          name: input.adminName.trim(),
          status: "active",
        })
        .returning({ id: users.id }),
    );

    // Seed system roles + grants for this tenant
    for (const template of SYSTEM_ROLES) {
      const role = first(
        await tx
          .insert(roles)
          .values({
            organizationId: org.id,
            key: template.key,
            name: template.name,
            description: template.description,
            isSystem: true,
          })
          .returning({ id: roles.id }),
      );

      if (template.grants.length > 0) {
        await tx.insert(rolePermissions).values(
          template.grants.map(([permission, scope]) => ({
            roleId: role.id,
            permission,
            scope,
          })),
        );
      }

      if (template.key === "admin") {
        await tx.insert(userRoles).values({ userId: user.id, roleId: role.id });
      }
    }

    // Directory record for the founder-admin + default leave types
    await tx.insert(employees).values({
      organizationId: org.id,
      userId: user.id,
      jobTitle: "Administrator",
      employeeCode: "EMP-001",
    });
    await tx.insert(organizationMemberships).values({ userId: user.id, organizationId: org.id });
    await tx.insert(leaveTypes).values([
      { organizationId: org.id, name: "Annual Leave", annualQuotaDays: "20", paid: true, autoAllocate: true },
      { organizationId: org.id, name: "Sick Leave", annualQuotaDays: "10", paid: true, autoAllocate: true },
      { organizationId: org.id, name: "Casual Leave", annualQuotaDays: "6", paid: false, autoAllocate: true },
    ]);

    // Default service catalog (F2.3) — mirrors migration-0041's backfill for
    // existing tenants so every org starts with the same requestable services.
    await tx.insert(serviceItems).values([
      { organizationId: org.id, name: "Access request", description: "Request access to a system, app or room.", category: "access", icon: "key", expectedDays: 1, approvalRequired: true, autoCreateTicket: false, sortOrder: 10 },
      { organizationId: org.id, name: "Hardware request", description: "Request a laptop, phone, monitor or peripheral.", category: "hardware", icon: "laptop", expectedDays: 5, approvalRequired: true, autoCreateTicket: true, sortOrder: 20 },
      { organizationId: org.id, name: "Software request", description: "Request a software license or installation.", category: "software", icon: "download", expectedDays: 2, approvalRequired: true, autoCreateTicket: true, sortOrder: 30 },
      { organizationId: org.id, name: "Account request", description: "Create, change or close an account.", category: "accounts", icon: "user", expectedDays: 1, approvalRequired: true, autoCreateTicket: false, sortOrder: 40 },
      { organizationId: org.id, name: "Report a security concern", description: "Report a suspected security issue.", category: "security", icon: "shield", expectedDays: 0, approvalRequired: false, autoCreateTicket: true, sortOrder: 50 },
    ]);

    return { orgId: org.id, userId: user.id };
  });
}

/** Platform-level Super Admin bootstrap (used by seed script only). */
export async function ensurePlatformSuperAdmin(
  email: string,
  passwordHash: string,
  name = "Platform Admin",
): Promise<void> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (existing[0]) return;

  // platform users need an organization row per schema; use a dedicated platform org
  let platformOrg = (
    await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "__platform"))
      .limit(1)
  )[0];
  if (!platformOrg) {
    platformOrg = first(
      await db
        .insert(organizations)
        .values({ name: "Wamiro Platform", slug: "__platform" })
        .returning({ id: organizations.id }),
    );
  }

  const [role] = await db
    .insert(roles)
    .values({
      organizationId: null,
      key: PLATFORM_SUPER_ADMIN.key,
      name: PLATFORM_SUPER_ADMIN.name,
      description: PLATFORM_SUPER_ADMIN.description,
      isSystem: true,
    })
    .onConflictDoNothing()
    .returning({ id: roles.id });

  let roleId = role?.id;
  if (!roleId) {
    const found = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, PLATFORM_SUPER_ADMIN.key))
      .limit(1);
    roleId = found[0]?.id;
  }
  if (!roleId) throw new Error("Could not create platform super admin role");

  if (PLATFORM_SUPER_ADMIN.grants.length > 0) {
    await db.insert(rolePermissions).values(
      PLATFORM_SUPER_ADMIN.grants.map(([permission, scope]) => ({
        roleId,
        permission,
        scope,
      })),
    ).onConflictDoNothing();
  }

  const user = first(
    await db
      .insert(users)
      .values({
        organizationId: platformOrg.id,
        email: email.toLowerCase(),
        passwordHash,
        name,
        status: "active",
      })
      .returning({ id: users.id }),
  );

  await db.insert(userRoles).values({ userId: user.id, roleId });
}

// ---------- departments (tenant structure) ----------

export async function listDepartments(ctx: AuthContext) {
  return db
    .select({
      id: departments.id,
      name: departments.name,
      managerName: users.name,
      memberCount: sql<number>`(SELECT count(*)::int FROM employees e WHERE e.department_id = ${departments.id})`,
    })
    .from(departments)
    .leftJoin(users, eq(users.id, departments.managerUserId))
    .where(eq(departments.organizationId, ctx.user.organizationId))
    .orderBy(departments.name);
}

export async function createDepartment(
  ctx: AuthContext,
  input: { name: string; parentDepartmentId?: string | null },
) {
  if (input.parentDepartmentId) {
    const [parent] = await db
      .select({ id: departments.id })
      .from(departments)
      // tenant check: parent must live in the caller's org
      .where(
        and(
          eq(departments.id, input.parentDepartmentId),
          eq(departments.organizationId, ctx.user.organizationId),
        ),
      )
      .limit(1);
    if (!parent) throw ApiError.badRequest("Parent department not found in your organization");
  }

  const row = first(
    await db
      .insert(departments)
      .values({
        organizationId: ctx.user.organizationId,
        name: input.name.trim(),
        parentDepartmentId: input.parentDepartmentId ?? null,
      })
      .returning({ id: departments.id }),
  );

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "DEPARTMENT_CREATED",
    entityType: "department",
    entityId: row.id,
    newValue: { name: input.name },
  });
  return row;
}
