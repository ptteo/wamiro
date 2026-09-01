/**
 * Employee custom fields: HR defines org-level field definitions; values are
 * stored per-employee in employees.custom_fields jsonb. Edit gated by
 * employees.edit; visible to anyone who can see the profile.
 */
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { customFieldDefs, employees } from "@/db/schema";
import { can } from "@/modules/iam/engine";

const TYPES = new Set(["text", "number", "date"]);

export async function listDefs(ctx: AuthContext) {
  return db
    .select({
      id: customFieldDefs.id,
      key: customFieldDefs.key,
      label: customFieldDefs.label,
      type: customFieldDefs.type,
      active: customFieldDefs.active,
    })
    .from(customFieldDefs)
    .where(eq(customFieldDefs.organizationId, ctx.user.organizationId))
    .orderBy(asc(customFieldDefs.label));
}

export async function createDef(
  ctx: AuthContext,
  input: { key?: string; label: string; type: string },
) {
  if (!can(ctx.access, "employees.edit")) {
    throw ApiError.forbidden("Missing permission: employees.edit");
  }
  const key =
    (input.key ?? input.label)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
  if (!key) throw ApiError.badRequest("Could not derive a valid field key");
  if (!TYPES.has(input.type)) throw ApiError.badRequest("Invalid field type");

  const inserted = await db
    .insert(customFieldDefs)
    .values({
      organizationId: ctx.user.organizationId,
      key,
      label: input.label.trim().slice(0, 80),
      type: input.type,
    })
    .onConflictDoNothing()
    .returning({ id: customFieldDefs.id });
  if (!inserted[0]) throw ApiError.conflict("A field with this key already exists");

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "CUSTOM_FIELD_CREATED",
    entityType: "custom_field_def",
    entityId: inserted[0].id,
    newValue: { key, label: input.label, type: input.type },
  });
}

export async function deactivateDef(ctx: AuthContext, defId: string) {
  if (!can(ctx.access, "employees.edit")) {
    throw ApiError.forbidden("Missing permission: employees.edit");
  }
  const updated = await db
    .update(customFieldDefs)
    .set({ active: false })
    .where(and(eq(customFieldDefs.id, defId), eq(customFieldDefs.organizationId, ctx.user.organizationId)))
    .returning({ id: customFieldDefs.id });
  if (!updated[0]) throw ApiError.notFound();

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "CUSTOM_FIELD_DEACTIVATED",
    entityType: "custom_field_def",
    entityId: defId,
  });
}

/** Set one custom value on an employee (values merged into the jsonb map). */
export async function setFieldValue(
  ctx: AuthContext,
  employeeUserId: string,
  key: string,
  value: string | null,
) {
  if (!can(ctx.access, "employees.edit")) {
    throw ApiError.forbidden("Missing permission: employees.edit");
  }
  const [emp] = await db
    .select({ id: employees.id, current: employees.customFields })
    .from(employees)
    .where(and(eq(employees.userId, employeeUserId), eq(employees.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!emp) throw ApiError.notFound();

  const merged = { ...(emp.current ?? {}), [key]: value };
  await db.update(employees).set({ customFields: merged }).where(eq(employees.id, emp.id));

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "EMPLOYEE_CUSTOM_FIELD_SET",
    entityType: "employee",
    entityId: employeeUserId,
    newValue: { [key]: value },
  });
}
