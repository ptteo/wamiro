import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { parseDomainList } from "@/lib/email-domain";
import type { AuthContext } from "@/lib/session";
import { can } from "@/modules/iam/engine";
import { organizations } from "@/db/schema";
import { setupChecklist } from "@/modules/org/service";

export {
  GATED_API_PREFIXES,
  GATED_PAGE_PREFIXES,
  isGatedApiPath,
  isGatedPagePath,
  isMfaAllowedPath,
  onboardingComplete,
} from "./gates";

const MFA_MODES = new Set(["optional", "required_admins", "required_all"]);
const PASSWORD_MODES = new Set(["self_service", "managed"]);

export function needsMfaSetup(ctx: AuthContext): boolean {
  if (ctx.user.totpEnabled) return false;
  if (ctx.org.mfaMode === "required_all") return true;
  if (ctx.org.mfaMode === "required_admins") {
    return can(ctx.access, "users.manage") || ctx.roleKeys.includes("admin");
  }
  return false;
}

export async function getPolicies(ctx: AuthContext) {
  if (!can(ctx.access, "settings.manage") && !can(ctx.access, "users.manage") && !can(ctx.access, "platform.admin")) {
    throw ApiError.forbidden();
  }
  const [row] = await db
    .select({
      allowedEmailDomains: organizations.allowedEmailDomains,
      mfaMode: organizations.mfaMode,
      passwordMode: organizations.passwordMode,
      onboardingState: organizations.onboardingState,
    })
    .from(organizations)
    .where(eq(organizations.id, ctx.user.organizationId))
    .limit(1);
  return row!;
}

export async function updatePolicies(
  ctx: AuthContext,
  input: { allowedEmailDomains?: unknown; mfaMode?: string; passwordMode?: string },
) {
  const platform = can(ctx.access, "platform.admin");
  if (!platform && !can(ctx.access, "settings.manage")) throw ApiError.forbidden();
  const patch: Partial<typeof organizations.$inferInsert> = {};
  if (input.allowedEmailDomains !== undefined) patch.allowedEmailDomains = parseDomainList(input.allowedEmailDomains);
  if (input.mfaMode !== undefined) {
    if (!MFA_MODES.has(input.mfaMode)) throw ApiError.badRequest("Invalid MFA mode");
    patch.mfaMode = input.mfaMode;
  }
  if (input.passwordMode !== undefined) {
    if (!PASSWORD_MODES.has(input.passwordMode)) throw ApiError.badRequest("Invalid password mode");
    patch.passwordMode = input.passwordMode;
  }
  if (Object.keys(patch).length === 0) return getPolicies(ctx);
  await db.update(organizations).set(patch).where(eq(organizations.id, ctx.user.organizationId));
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ORG_POLICIES_UPDATED",
    entityType: "organization",
    entityId: ctx.user.organizationId,
    newValue: patch,
  });
  return getPolicies(ctx);
}

export async function syncOnboardingState(ctx: AuthContext): Promise<string> {
  const [row] = await db
    .select({ onboardingState: organizations.onboardingState })
    .from(organizations)
    .where(eq(organizations.id, ctx.user.organizationId))
    .limit(1);
  const current = row?.onboardingState ?? "complete";
  if (current === "complete") return current;
  const setup = await setupChecklist(ctx);
  let next = current;
  const brand = setup.steps.find((s) => s.key === "brand")?.done;
  const team = setup.steps.find((s) => s.key === "team")?.done;
  const announce = setup.steps.find((s) => s.key === "announce")?.done;
  if (brand) {
    if (next === "pending") next = "admin_done";
  }
  if (team) {
    if (next === "pending" || next === "admin_done") next = "employees_seeded";
  }
  // Wizard is brand + team + announce. KB stays a Home nudge, not a gate.
  if (brand && team && announce) next = "complete";
  if (next !== current) {
    await db
      .update(organizations)
      .set({ onboardingState: next })
      .where(eq(organizations.id, ctx.user.organizationId));
  }
  return next;
}

export async function forceCompleteOnboarding(ctx: AuthContext, orgId: string): Promise<void> {
  if (!can(ctx.access, "platform.admin")) throw ApiError.forbidden("Missing permission: platform.admin");
  await db.update(organizations).set({ onboardingState: "complete" }).where(eq(organizations.id, orgId));
  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "ONBOARDING_FORCE_COMPLETED",
    entityType: "organization",
    entityId: orgId,
  });
}
