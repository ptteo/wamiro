/**
 * Admin panel Phase F — entitlements & controls (§3.4) + operator roles (§3.7)
 * + ops export governance (fold-in #5).
 *
 * ENTITLEMENTS HOT-PATH CONTRACT: values are cached in-process per org with a
 * 60 s TTL. The session load reads the cache — zero added queries in steady
 * state; a kill-switch takes effect within ≤60 s, which is the documented
 * contract (§8). Writes bump the cache entry so the writing instance sees the
 * change immediately; other instances converge on their next TTL refresh.
 *
 * ENTITLEMENT KEY GRAMMAR (enforced here, one validator, one consumer each):
 *   module.<name>   'on' | 'off'  → kill-switch; checked in session load
 *   cap.seats       number        → overrides the org's seat limit when lower
 *   limit.api_per_min number      → per-org mutation rate limit override
 *   flag.<name>     'on' | 'off'  → feature flags (consulted by features)
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { organizations, platformOperators, platformOrgEntitlements, users } from "@/db/schema";
import type { AuthContext } from "@/lib/session";
import { requirePlatform } from "./console";

// ---------------------------------------------------------------------------
// Cache — per-org map with a 60 s TTL. Entry absence = unknown; undefined
// values inside the entry mean "no rows" (cached negative).
// ---------------------------------------------------------------------------

const TTL_MS = 60_000;
type Entitlements = Record<string, string>;
const cache = new Map<string, { at: number; values: Entitlements | undefined }>();

/** Test hook + internal: drop the whole cache. */
export function clearEntitlementsCache(): void {
  cache.clear();
}

async function loadEntitlements(orgId: string): Promise<Entitlements | undefined> {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at <= TTL_MS) return hit.values;
  const rows = await db
    .select({ key: platformOrgEntitlements.key, value: platformOrgEntitlements.value })
    .from(platformOrgEntitlements)
    .where(eq(platformOrgEntitlements.orgId, orgId));
  const values: Entitlements = {};
  for (const r of rows) values[r.key] = r.value;
  cache.set(orgId, { at: Date.now(), values });
  return values;
}

export type PlatformLevel = "viewer" | "operator" | "admin";
const LEVEL_ORDER: Record<PlatformLevel, number> = { viewer: 1, operator: 2, admin: 3 };

/**
 * §3.7 — leveled platform gate. Replaces bare requirePlatform at call sites:
 *   viewer   = read-only console (GET surfaces)
 *   operator = can act (plans, impersonation, broadcasts, invoices, alerts)
 *   admin    = manage operators, entitlements, destructive ops
 * platform.admin (the IAM permission) remains the outer wall — nobody below
 * viewer gets in; this gate only narrows WITHIN the platform team.
 */
export function requirePlatformLevel(ctx: AuthContext, level: PlatformLevel = "operator"): void {
  requirePlatform(ctx);
  // admin permission implies the top level regardless of the row.
  if (level === "viewer") return;
  const row = operatorRoleSync.get(ctx.user.id);
  const effective: PlatformLevel = row ?? "admin";
  if (LEVEL_ORDER[effective] < LEVEL_ORDER[level]) {
    throw ApiError.forbidden(`Platform role ${effective} lacks level: ${level}`);
  }
}

/**
 * Operator role cache — the operators table is tiny (a platform team), so a
 * process-wide map with the same 60 s TTL keeps this check query-free.
 */
const operatorRoleSync = new Map<string, PlatformLevel>();
let operatorsLoadedAt = 0;

async function refreshOperators(): Promise<void> {
  const rows = await db
    .select({ userId: platformOperators.userId, role: platformOperators.role })
    .from(platformOperators);
  operatorRoleSync.clear();
  for (const r of rows) operatorRoleSync.set(r.userId, r.role as PlatformLevel);
  operatorsLoadedAt = Date.now();
}

/** Load (and cache) the caller's operator level. Admin permission = admin. */
export async function platformLevelOf(ctx: AuthContext): Promise<PlatformLevel> {
  if (Date.now() - operatorsLoadedAt > TTL_MS) await refreshOperators();
  return operatorRoleSync.get(ctx.user.id) ?? "admin";
}

// ---------------------------------------------------------------------------
// Entitlement reads (hot path)
// ---------------------------------------------------------------------------

/** Raw string value or null. Session-load friendly (no throws). */
export async function entitlementValue(orgId: string, key: string): Promise<string | null> {
  try {
    const values = await loadEntitlements(orgId);
    return values?.[key] ?? null;
  } catch {
    return null; // never let the panel break the tenant hot path
  }
}

/** module.<name> kill-switch: 'off' wins over org.modules. */
export async function isModuleKilled(orgId: string, moduleName: string): Promise<boolean> {
  return (await entitlementValue(orgId, `module.${moduleName}`)) === "off";
}

/** cap.seats — returns the entitlement cap when it is LOWER than the plan cap. */
export async function seatCapOverride(orgId: string, effectiveLimit: number | null): Promise<number | null> {
  const raw = await entitlementValue(orgId, "cap.seats");
  const n = raw === null ? Number.NaN : Number(raw);
  if (!Number.isFinite(n) || n < 1) return effectiveLimit;
  return effectiveLimit === null ? n : Math.min(n, effectiveLimit);
}

/** limit.api_per_min — number or null (caller falls back to the default). */
export async function apiRateOverride(orgId: string): Promise<number | null> {
  const raw = await entitlementValue(orgId, "limit.api_per_min");
  const n = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

// ---------------------------------------------------------------------------
// Entitlement writes (controls tab)
// ---------------------------------------------------------------------------

const KEY_RE = /^(module|flag)\.[a-z_]+$/;
const NUM_KEY_RE = /^(cap\.seats|limit\.api_per_min)$/;

function validateKeyValue(key: string, value: string): void {
  if (KEY_RE.test(key)) {
    if (value !== "on" && value !== "off") throw ApiError.badRequest(`${key} must be 'on' or 'off'`);
    return;
  }
  if (NUM_KEY_RE.test(key)) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) throw ApiError.badRequest(`${key} must be a positive number`);
    return;
  }
  throw ApiError.badRequest("key must be module.<name>, flag.<name>, cap.seats or limit.api_per_min");
}

/** List every entitlement for an org (Controls tab). */
export async function listEntitlements(ctx: AuthContext, orgId: string) {
  requirePlatformLevel(ctx, "viewer");
  const rows = await db
    .select()
    .from(platformOrgEntitlements)
    .where(eq(platformOrgEntitlements.orgId, orgId));
  return rows.map((r) => ({
    key: r.key,
    value: r.value,
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** Set one entitlement (admin level — §3.7). Audited; bumps the cache. */
export async function setEntitlement(ctx: AuthContext, orgId: string, key: string, value: string): Promise<void> {
  requirePlatformLevel(ctx, "admin");
  validateKeyValue(key, value);
  const [org] = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) throw ApiError.notFound("Organization not found");

  await db
    .insert(platformOrgEntitlements)
    .values({ orgId, key, value, updatedBy: ctx.user.id, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [platformOrgEntitlements.orgId, platformOrgEntitlements.key],
      set: { value, updatedBy: ctx.user.id, updatedAt: new Date() },
    });
  // write path bumps the cache version (§3.4): this instance refreshes now
  cache.delete(orgId);

  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_ENTITLEMENT_SET",
    entityType: "platform_entitlement",
    entityId: orgId,
    newValue: { key, value, orgName: org.name },
  });
}

export async function deleteEntitlement(ctx: AuthContext, orgId: string, key: string): Promise<void> {
  requirePlatformLevel(ctx, "admin");
  const deleted = await db
    .delete(platformOrgEntitlements)
    .where(and(eq(platformOrgEntitlements.orgId, orgId), eq(platformOrgEntitlements.key, key)))
    .returning({ id: platformOrgEntitlements.key });
  if (!deleted[0]) throw ApiError.notFound("Entitlement not found");
  cache.delete(orgId);
  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_ENTITLEMENT_CLEARED",
    entityType: "platform_entitlement",
    entityId: orgId,
    newValue: { key },
  });
}

// ---------------------------------------------------------------------------
// Operator management (admin level)
// ---------------------------------------------------------------------------

export async function listOperators(ctx: AuthContext) {
  requirePlatformLevel(ctx, "viewer");
  const rows = await db
    .select({
      userId: platformOperators.userId,
      role: platformOperators.role,
      name: users.name,
      email: users.email,
      createdAt: platformOperators.createdAt,
    })
    .from(platformOperators)
    .innerJoin(users, eq(users.id, platformOperators.userId))
    .orderBy(users.name);
  return rows.map((r) => ({
    userId: r.userId,
    role: r.role as PlatformLevel,
    name: r.name,
    email: r.email,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Grant/level-change operator role. Requester must be admin; self-demote allowed. */
export async function setOperatorRole(ctx: AuthContext, userId: string, role: PlatformLevel): Promise<void> {
  requirePlatformLevel(ctx, "admin");
  if (!(["viewer", "operator", "admin"] as const).includes(role)) {
    throw ApiError.badRequest("role must be viewer|operator|admin");
  }
  const [user] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw ApiError.notFound("User not found");

  await db
    .insert(platformOperators)
    .values({ userId, role, createdBy: ctx.user.id })
    .onConflictDoUpdate({ target: platformOperators.userId, set: { role } });
  await refreshOperators();

  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_OPERATOR_ROLE_SET",
    entityType: "platform_operator",
    entityId: userId,
    newValue: { role, name: user.name },
  });
}

// ---------------------------------------------------------------------------
// Ops export governance (fold-in #5)
// ---------------------------------------------------------------------------

/**
 * SOC-2-style ops export gate: a REASON is mandatory and is written to the
 * platform audit with the dataset + date range + requesting operator. The
 * compliance artifact itself stays compliant; no silent exfiltration path.
 */
export async function auditOpsExport(
  ctx: AuthContext,
  input: { dataset: string; from: string; to: string; reason: string },
): Promise<void> {
  requirePlatformLevel(ctx, "operator");
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 10) {
    throw ApiError.badRequest("Export requires a reason (min 10 chars) — stored in the audit log");
  }
  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_OPS_EXPORT",
    entityType: "platform_export",
    entityId: null,
    newValue: {
      dataset: String(input.dataset).slice(0, 120),
      from: String(input.from).slice(0, 40),
      to: String(input.to).slice(0, 40),
      reason: reason.slice(0, 500),
    },
  });
}
