/**
 * Admin panel — contract registry (fold-in #3, extends B-fix).
 *
 * Enterprise deals bought OUTSIDE Paddle (annual invoicing, bank transfer,
 * PO numbers) become first-class revenue: `platform.contracts` records the
 * commercial terms so the §4.2 renewal forecast is real instead of
 * trial-based only. HISTORICAL class (§2.2): soft org ref + name snapshots —
 * contract history survives tenant deletion.
 *
 * MRR treatment: annual_value_cents / 12 is the contract's monthly
 * equivalent, shown alongside the seats×price MRR (ledger wins on conflict,
 * amendment #7 — contracts are forward-looking context, not collected truth).
 */
import { asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { organizations, platformContracts } from "@/db/schema";
import { requirePlatformLevel } from "./entitlements";
import type { AuthContext } from "@/lib/session";

export interface ContractView {
  id: string;
  orgId: string | null;
  orgName: string;
  orgSlug: string;
  startDate: string;
  endDate: string | null;
  annualValueCents: number;
  currency: string;
  poNumber: string | null;
  autoRenew: boolean;
  paymentMethod: string;
  notes: string;
  createdAt: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDateInput(v: string | null | undefined, field: string, required: boolean): string | null {
  if (v === undefined || v === null || v === "") {
    if (required) throw ApiError.badRequest(`${field} is required`);
    return null;
  }
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest(`${field} must be a date (YYYY-MM-DD)`);
  return isoDate(d);
}

/** List all contracts, soonest-ending first (deleted tenants included). */
export async function listContracts(ctx: AuthContext): Promise<ContractView[]> {
  requirePlatformLevel(ctx, "viewer");
  const rows = await db
    .select()
    .from(platformContracts)
    .orderBy(asc(platformContracts.endDate), desc(platformContracts.createdAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    orgId: r.orgId,
    orgName: r.orgName,
    orgSlug: r.orgSlug,
    startDate: String(r.startDate),
    endDate: r.endDate ? String(r.endDate) : null,
    annualValueCents: r.annualValueCents,
    currency: r.currency,
    poNumber: r.poNumber,
    autoRenew: r.autoRenew,
    paymentMethod: r.paymentMethod,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function createContract(
  ctx: AuthContext,
  input: {
    orgId: string;
    startDate: string;
    endDate?: string | null;
    annualValueCents: number;
    currency?: string;
    poNumber?: string | null;
    autoRenew?: boolean;
    paymentMethod?: string;
    notes?: string;
  },
): Promise<ContractView> {
  requirePlatformLevel(ctx, "operator");
  const amount = Math.round(Number(input.annualValueCents));
  if (!Number.isFinite(amount) || amount < 0) throw ApiError.badRequest("Invalid annual value");
  const paymentMethod = (input.paymentMethod ?? "bank").toLowerCase();
  if (paymentMethod !== "card" && paymentMethod !== "bank") {
    throw ApiError.badRequest("paymentMethod must be card or bank");
  }

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);
  if (!org) throw ApiError.notFound("Organization not found");

  const start = parseDateInput(input.startDate, "startDate", true)!;
  const end = parseDateInput(input.endDate, "endDate", false);
  if (end && end <= start) throw ApiError.badRequest("endDate must be after startDate");

  const [row] = await db
    .insert(platformContracts)
    .values({
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug,
      startDate: start,
      endDate: end,
      annualValueCents: amount,
      currency: (input.currency ?? "USD").slice(0, 3).toUpperCase(),
      poNumber: input.poNumber?.trim().slice(0, 120) || null,
      autoRenew: input.autoRenew ?? true,
      paymentMethod,
      notes: (input.notes ?? "").slice(0, 2000),
      createdBy: ctx.user.id,
    })
    .returning();

  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_CONTRACT_CREATED",
    entityType: "platform_contract",
    entityId: row!.id,
    newValue: { orgName: org.name, start, end, annualValueCents: amount, paymentMethod },
  });
  return {
    id: row!.id,
    orgId: row!.orgId,
    orgName: row!.orgName,
    orgSlug: row!.orgSlug,
    startDate: String(row!.startDate),
    endDate: row!.endDate ? String(row!.endDate) : null,
    annualValueCents: row!.annualValueCents,
    currency: row!.currency,
    poNumber: row!.poNumber,
    autoRenew: row!.autoRenew,
    paymentMethod: row!.paymentMethod,
    notes: row!.notes,
    createdAt: row!.createdAt.toISOString(),
  };
}

/** Amend terms (end date, value, auto-renew…). Audited with the delta. */
export async function updateContract(
  ctx: AuthContext,
  contractId: string,
  input: { endDate?: string | null; annualValueCents?: number; autoRenew?: boolean; poNumber?: string | null; notes?: string },
): Promise<void> {
  requirePlatformLevel(ctx, "operator");
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.endDate !== undefined) {
    patch.endDate = parseDateInput(input.endDate, "endDate", false);
  }
  if (input.annualValueCents !== undefined) {
    const amount = Math.round(Number(input.annualValueCents));
    if (!Number.isFinite(amount) || amount < 0) throw ApiError.badRequest("Invalid annual value");
    patch.annualValueCents = amount;
  }
  if (input.autoRenew !== undefined) patch.autoRenew = Boolean(input.autoRenew);
  if (input.poNumber !== undefined) patch.poNumber = input.poNumber?.trim().slice(0, 120) || null;
  if (input.notes !== undefined) patch.notes = String(input.notes).slice(0, 2000);
  if (Object.keys(patch).length === 1) throw ApiError.badRequest("Nothing to update");

  const updated = await db
    .update(platformContracts)
    .set(patch)
    .where(eq(platformContracts.id, contractId))
    .returning({ id: platformContracts.id, orgName: platformContracts.orgName });
  if (!updated[0]) throw ApiError.notFound("Contract not found");

  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_CONTRACT_UPDATED",
    entityType: "platform_contract",
    entityId: contractId,
    newValue: { orgName: updated[0].orgName, ...input },
  });
}

/** Contracts renewing within N days — the forecast's contract slice (§4.2). */
export async function contractsRenewing(
  ctx: AuthContext,
  days = 30,
): Promise<{ orgId: string | null; orgName: string; endDate: string; annualValueCents: number; currency: string; autoRenew: boolean }[]> {
  requirePlatformLevel(ctx, "viewer");
  const res = await db.execute(sql`
    SELECT id::text AS id, org_id AS "orgId", org_name AS "orgName", end_date AS "endDate",
           annual_value_cents AS "annualValueCents", currency, auto_renew AS "autoRenew"
    FROM platform.contracts
    WHERE end_date IS NOT NULL
      AND end_date BETWEEN current_date AND (current_date + ${days}::int)
    ORDER BY end_date ASC
    LIMIT 100
  `);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    orgId: (r.orgId as string | null) ?? null,
    orgName: String(r.orgName ?? ""),
    endDate: String(r.endDate),
    annualValueCents: Number(r.annualValueCents ?? 0),
    currency: String(r.currency ?? "USD"),
    autoRenew: Boolean(r.autoRenew),
  }));
}
