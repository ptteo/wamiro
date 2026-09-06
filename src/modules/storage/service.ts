/**
 * Phase 4 — storage visibility: per-tenant usage by category, platform fleet
 * view, and the orphaned-object sweep. All usage numbers come from listing
 * the object store (S3 or local disk) — the source of truth that includes
 * objects whose DB rows are gone.
 */
import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { isObjectStorageConfigured, type OrgUsage, usageForOrg } from "@/lib/storage";
import type { AuthContext } from "@/lib/session";
import { can } from "@/modules/iam/engine";
import { organizations } from "@/db/schema";

export interface OrgStorageView extends OrgUsage {
  storageBackend: "s3" | "local";
  /** True when this tenant has a pending deletion request (skipped by sweeps). */
  deletionPending: boolean;
}

/** Tenant admin: usage per category for their own org. */
export async function orgStorageUsage(ctx: AuthContext): Promise<OrgStorageView> {
  if (!can(ctx.access, "users.manage") && !can(ctx.access, "settings.manage")) {
    throw ApiError.forbidden("Missing permission: users.manage");
  }
  const [org] = await db
    .select({ deletionRequestedAt: organizations.deletionRequestedAt })
    .from(organizations)
    .where(eq(organizations.id, ctx.user.organizationId))
    .limit(1);
  const usage = await usageForOrg(ctx.user.organizationId);
  return {
    ...usage,
    storageBackend: isObjectStorageConfigured() ? "s3" : "local",
    deletionPending: Boolean(org?.deletionRequestedAt),
  };
}

export interface FleetOrgUsage {
  organizationId: string;
  name: string;
  totalBytes: number;
  totalObjects: number;
}

export interface FleetStorageView {
  storageBackend: "s3" | "local";
  totalBytes: number;
  totalObjects: number;
  tenantCount: number;
  /** Largest tenants by bytes (bounded) — enough for the console card. */
  topTenants: FleetOrgUsage[];
}

/**
 * Platform console: fleet storage snapshot. Lists per-org prefixes (bounded
 * by tenant count and per-org object cap) so the operator sees where data
 * lives without SSH.
 */
export async function fleetStorage(ctx: AuthContext): Promise<FleetStorageView> {
  if (!can(ctx.access, "platform.admin")) throw ApiError.forbidden("Missing permission: platform.admin");
  const tenants = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(sql`${organizations.slug} <> '__platform'`)
    .orderBy(asc(organizations.createdAt))
    .limit(500);

  const perOrg: FleetOrgUsage[] = [];
  let totalBytes = 0;
  let totalObjects = 0;
  for (const t of tenants) {
    // Bounded: cap the object listing per tenant so a single pathological
    // bucket can't stall the console. The daily orphan sweep covers the rest.
    const usage = await usageForOrg(t.id, { limit: 5000 }).catch(() => null);
    if (!usage) continue;
    perOrg.push({
      organizationId: t.id,
      name: t.name,
      totalBytes: usage.totalBytes,
      totalObjects: usage.totalObjects,
    });
    totalBytes += usage.totalBytes;
    totalObjects += usage.totalObjects;
  }
  perOrg.sort((a, b) => b.totalBytes - a.totalBytes);
  return {
    storageBackend: isObjectStorageConfigured() ? "s3" : "local",
    totalBytes,
    totalObjects,
    tenantCount: tenants.length,
    topTenants: perOrg.slice(0, 10),
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i += 1;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}