/**
 * R5 §17 — personal user configuration.
 * Global prefs travel with the person across tenants; tenant-scoped prefs
 * apply only inside one organization. Tenant overrides global per key.
 */
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/session";
import { userPreferences } from "@/db/schema";

const ALLOWED_KEYS = new Set([
  "theme",
  "language",
  "timezone",
  "dateFormat",
  "density",
  "defaultWorkspace",
  "defaultLandingPage",
  "sidebarCollapsed",
  "notificationPrefs",
  "emailPrefs",
  "accessibilityPrefs",
  "dashboardLayout",
  "tourState",
  "roleChecklist",
]);

export async function getMergedPreferences(userId: string, orgId: string) {
  const rows = await db
    .select({ key: userPreferences.key, value: userPreferences.value, org: userPreferences.organizationId })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  const merged: Record<string, unknown> = {};
  for (const r of rows) {
    if (r.org === null || r.org === orgId) merged[r.key] = r.value; // tenant wins by overwrite order
  }
  return merged;
}

export async function setPreference(
  ctx: Pick<AuthContext, "user"> & { user: { id: string; organizationId: string } },
  input: { key: string; value: unknown; orgScoped?: boolean },
) {
  if (!ALLOWED_KEYS.has(input.key)) throw new Error(`Unsupported preference: ${input.key}`);
  const orgId = input.orgScoped ? ctx.user.organizationId : null;
  // Manual upsert: two partial unique indexes (global vs tenant) can't both be
  // expressed in one ON CONFLICT target.
  const updated = await db
    .update(userPreferences)
    .set({ value: input.value as never, updatedAt: new Date() })
    .where(
      and(
        eq(userPreferences.userId, ctx.user.id),
        eq(userPreferences.key, input.key),
        orgId === null ? isNull(userPreferences.organizationId) : eq(userPreferences.organizationId, orgId),
      ),
    )
    .returning({ id: userPreferences.id });
  if (updated.length === 0) {
    await db.insert(userPreferences).values({
      userId: ctx.user.id,
      organizationId: orgId,
      key: input.key,
      value: input.value as never,
    });
  }
}

export async function deletePreference(
  userId: string,
  key: string,
  orgId: string | null,
) {
  await db
    .delete(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.key, key),
        orgId === null ? isNull(userPreferences.organizationId) : eq(userPreferences.organizationId, orgId),
      ),
    );
}
