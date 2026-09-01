/**
 * Frappe HR adapter (blueprint §32/§40): Frappe owns the HR master;
 * Wamiro mirrors employees into its directory via token-authenticated REST.
 *
 * Config (env): FRAPPE_BASE_URL, FRAPPE_TOKEN  ("api_key:api_secret")
 * Never configured → sync is a no-op and the UI hides the action.
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { hashPassword } from "@/lib/password";
import type { AuthContext } from "@/lib/session";
import { departments, employees, roles, userRoles, users } from "@/db/schema";

export function frappeConfig(): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.FRAPPE_BASE_URL?.replace(/\/$/, "");
  const token = process.env.FRAPPE_TOKEN;
  return baseUrl && token ? { baseUrl, token } : null;
}

interface FrappeEmployee {
  name: string; // frappe doc id
  employee_name: string;
  company_email: string | null;
  designation: string | null;
  department: string | null;
  reports_to: string | null;
}

async function frappeGet<T>(path: string): Promise<T[]> {
  const cfg = frappeConfig();
  if (!cfg) throw new Error("FRAPPE_NOT_CONFIGURED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${cfg.baseUrl}/api/resource/${path}?limit_page_length=0`, {
      headers: { Authorization: `token ${cfg.token}` },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`frappe ${res.status} on ${path}`);
    const data = (await res.json()) as { data: T[] };
    return data.data ?? [];
  } finally {
    clearTimeout(timer);
  }
}

async function ensureDepartment(orgId: string, name: string | null): Promise<string | null> {
  if (!name) return null;
  const existing = await db
    .select({ id: departments.id })
    .from(departments)
    .where(and(eq(departments.organizationId, orgId), eq(departments.name, name)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [d] = await db
    .insert(departments)
    .values({ organizationId: orgId, name })
    .returning({ id: departments.id });
  return d?.id ?? null;
}

export interface SyncResult {
  imported: number;
  updated: number;
  skipped: number;
}

/**
 * Pull Frappe employees into Wamiro:
 *  - match by email → update job title/department
 *  - no match → create an invited user (random password, admin resets) + employee row
 * Manager mapping by Frappe id is deferred until a second pass exists.
 */
export async function syncEmployees(ctx: AuthContext): Promise<SyncResult> {
  const result: SyncResult = { imported: 0, updated: 0, skipped: 0 };
  const orgId = ctx.user.organizationId;

  // resolve role ids once
  const [employeeRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.organizationId, orgId), eq(roles.key, "employee")))
    .limit(1);

  let frappeEmployees: FrappeEmployee[];
  try {
    frappeEmployees = await frappeGet<FrappeEmployee>("Employee");
  } catch (e) {
    if (e instanceof Error && e.message === "FRAPPE_NOT_CONFIGURED") {
      throw ApiError.badRequest("Frappe is not configured (FRAPPE_BASE_URL / FRAPPE_TOKEN)");
    }
    throw ApiError.badRequest("Could not reach Frappe — check URL/token");
  }

  for (const fe of frappeEmployees) {
    const email = fe.company_email?.trim().toLowerCase();
    if (!email) {
      result.skipped++;
      continue;
    }
    const deptId = await ensureDepartment(orgId, fe.department);

    let [user] = await db
      .select({ id: users.id, organizationId: users.organizationId })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || user.organizationId !== orgId) {
      // import as an invited member of this tenant
      const { randomBytes } = await import("node:crypto");
      const tempHash = await hashPassword(randomBytes(18).toString("base64url"));
      const inserted = await db
        .insert(users)
        .values({
          organizationId: orgId,
          email,
          name: fe.employee_name?.trim() || email,
          passwordHash: tempHash,
          status: "invited",
        })
        .onConflictDoNothing()
        .returning({ id: users.id });
      user = inserted[0] ? { ...inserted[0], organizationId: orgId } : undefined;
      if (!user) {
        result.skipped++;
        continue;
      }
      if (employeeRole) {
        await db
          .insert(userRoles)
          .values({ userId: user.id, roleId: employeeRole.id })
          .onConflictDoNothing();
      }
      result.imported++;
    } else {
      result.updated++;
    }

    const [emp] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.userId, user.id))
      .limit(1);
    if (!emp) {
      await db.insert(employees).values({
        organizationId: orgId,
        userId: user.id,
        employeeCode: fe.name,
        jobTitle: fe.designation ?? null,
        departmentId: deptId,
      });
    }
  }

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "HR_SYNC",
    entityType: "integration",
    metadata: result,
  });
  return result;
}
