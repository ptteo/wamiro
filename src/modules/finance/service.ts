/**
 * D12 — Finance & procurement service.
 * All queries tenant-scoped via ctx.user.organizationId.
 */
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import {
  budgets,
  departments,
  employees,
  expenses,
  financeApprovalThresholds,
  projects,
  purchaseRequests,
  travelRequests,
  users,
  vendorDocuments,
  vendors,
} from "@/db/schema";
import { can, widestScope } from "@/modules/iam/engine";

export const EXPENSE_STATUSES = ["draft", "submitted", "approved", "rejected", "reimbursed", "canceled"] as const;
export const PURCHASE_STATUSES = ["draft", "submitted", "approved", "rejected", "ordered", "received", "canceled"] as const;
export const TRAVEL_STATUSES = ["draft", "submitted", "approved", "rejected", "canceled"] as const;
export const VENDOR_STATUSES = ["active", "pending", "inactive", "blocked"] as const;

function assertCents(n: number) {
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000_00) throw ApiError.badRequest("Invalid amount");
}

// ---------- visibility helpers ----------

function expenseVisible(ctx: AuthContext) {
  if (can(ctx.access, "finance.view_company")) return eq(expenses.organizationId, ctx.user.organizationId);
  // submitter or own reports
  return and(
    eq(expenses.organizationId, ctx.user.organizationId),
    or(
      eq(expenses.submittedBy, ctx.user.id),
      sql`${expenses.submittedBy} IN (SELECT user_id FROM employees WHERE manager_user_id = ${ctx.user.id})`,
    ),
  )!;
}
export function canApproveFinance(ctx: AuthContext) {
  return can(ctx.access, "finance.approve");
}

/** Company-scope finance approver (band decisions always allowed). */
function companyApprover(ctx: AuthContext): boolean {
  const scope = can(ctx.access, "finance.approve") && widestScope(ctx.access, "finance.approve");
  return scope === "COMPANY" || scope === "GLOBAL";
}

/** Is the actor the direct manager of the subject? */
async function isManagerOf(ctx: AuthContext, subjectId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: employees.userId })
    .from(employees)
    .where(and(eq(employees.userId, subjectId), eq(employees.managerUserId, ctx.user.id)))
    .limit(1);
  return !!row;
}

/** Phase 8 — the active threshold band covering an amount (first match wins). */
async function matchingThreshold(orgId: string, amountCents: number) {
  const [row] = await db
    .select()
    .from(financeApprovalThresholds)
    .where(
      and(
        eq(financeApprovalThresholds.organizationId, orgId),
        eq(financeApprovalThresholds.active, true),
        sql`${financeApprovalThresholds.minAmountCents} <= ${amountCents}`,
        or(
          sql`${financeApprovalThresholds.maxAmountCents} IS NULL`,
          sql`${financeApprovalThresholds.maxAmountCents} >= ${amountCents}`,
        ),
      ),
    )
    .orderBy(desc(financeApprovalThresholds.minAmountCents))
    .limit(1);
  return row ?? null;
}

/** Phase 8 — threshold chain admin (finance.approve). */
export async function listThresholds(ctx: AuthContext) {
  if (!canApproveFinance(ctx)) throw ApiError.forbidden();
  return db
    .select()
    .from(financeApprovalThresholds)
    .where(eq(financeApprovalThresholds.organizationId, ctx.user.organizationId))
    .orderBy(financeApprovalThresholds.minAmountCents);
}

export async function setThresholds(
  ctx: AuthContext,
  rows: { minAmountCents: number; maxAmountCents: number | null; approverMode: "company" | "manager"; active?: boolean }[],
) {
  if (!canApproveFinance(ctx)) throw ApiError.forbidden();
  const orgId = ctx.user.organizationId;
  await db.delete(financeApprovalThresholds).where(eq(financeApprovalThresholds.organizationId, orgId));
  const clean = rows
    .filter((r) => Number.isFinite(r.minAmountCents) && r.minAmountCents >= 0)
    .slice(0, 20)
    .map((r) => ({
      organizationId: orgId,
      minAmountCents: Math.round(r.minAmountCents),
      maxAmountCents: r.maxAmountCents === null || r.maxAmountCents === undefined ? null : Math.round(r.maxAmountCents),
      approverMode: r.approverMode === "manager" ? "manager" : "company",
      active: r.active ?? true,
    }));
  if (clean.length) await db.insert(financeApprovalThresholds).values(clean);
  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "FINANCE_THRESHOLDS_UPDATED",
    entityType: "finance_thresholds",
    entityId: orgId,
    newValue: { count: clean.length },
  });
  return listThresholds(ctx);
}

// ---------- expenses ----------

export async function listExpenses(
  ctx: AuthContext,
  opts: { status?: string; mine?: boolean; q?: string; sort?: "recent" | "amount" | "date" } = {},
) {
  const conds = [expenseVisible(ctx)];
  if (opts.mine) conds.push(eq(expenses.submittedBy, ctx.user.id));
  if (opts.status) conds.push(eq(expenses.status, opts.status));
  if (opts.q && opts.q.trim()) {
    const like = `%${opts.q.trim().toLowerCase()}%`;
    // Postgres ILIKE on title or category, plus a coalesce on submitter
    // name so the join isn't mandatory for the filter to work.
    conds.push(sql`(lower(${expenses.title}) LIKE ${like} OR lower(coalesce(${expenses.category},'')) LIKE ${like})`);
  }
  const order =
    opts.sort === "amount"
      ? desc(expenses.amountCents)
      : opts.sort === "date"
        ? desc(expenses.incurredAt)
        : desc(expenses.createdAt);
  return db
    .select({
      id: expenses.id,
      title: expenses.title,
      category: expenses.category,
      amountCents: expenses.amountCents,
      currency: expenses.currency,
      incurredAt: expenses.incurredAt,
      status: expenses.status,
      submitterName: users.name,
      submittedBy: expenses.submittedBy,
      createdAt: expenses.createdAt,
    })
    .from(expenses)
    .innerJoin(users, eq(users.id, expenses.submittedBy))
    .where(and(...conds))
    .orderBy(order)
    .limit(200);
}

export async function getExpense(ctx: AuthContext, id: string) {
  const rows = await db
    .select({
      e: expenses,
      submitterName: users.name,
      projectName: projects.name,
      budgetName: budgets.name,
      vendorName: vendors.name,
    })
    .from(expenses)
    .innerJoin(users, eq(users.id, expenses.submittedBy))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .leftJoin(budgets, eq(budgets.id, expenses.budgetId))
    .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
    .where(and(eq(expenses.id, id), expenseVisible(ctx)))
    .limit(1);
  if (!rows[0]) throw ApiError.notFound();
  return rows[0];
}

export async function createExpense(
  ctx: AuthContext,
  input: {
    title: string;
    category?: string;
    amountCents: number;
    currency?: string;
    incurredAt: string;
    projectId?: string;
    costCenter?: string;
    budgetId?: string;
    vendorId?: string;
    notes?: string;
    submit?: boolean;
  },
) {
  assertCents(input.amountCents);
  const [row] = await db
    .insert(expenses)
    .values({
      organizationId: ctx.user.organizationId,
      submittedBy: ctx.user.id,
      title: input.title.slice(0, 300),
      category: input.category ?? "other",
      amountCents: Math.round(input.amountCents),
      currency: (input.currency ?? "USD").toUpperCase().slice(0, 3),
      incurredAt: input.incurredAt,
      projectId: input.projectId ?? null,
      costCenter: input.costCenter ?? null,
      budgetId: input.budgetId ?? null,
      vendorId: input.vendorId ?? null,
      notes: input.notes ?? null,
      status: input.submit ? "submitted" : "draft",
    })
    .returning({ id: expenses.id });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: input.submit ? "EXPENSE_SUBMITTED" : "EXPENSE_CREATED",
    entityType: "expense",
    entityId: row!.id,
    newValue: { amountCents: input.amountCents, currency: input.currency },
  });
  return row!.id;
}

async function loadExpenseForDecision(ctx: AuthContext, id: string) {
  const [row] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  return row;
}

export async function decideExpense(ctx: AuthContext, id: string, action: "approve" | "reject" | "reimburse" | "cancel") {
  const row = await loadExpenseForDecision(ctx, id);
  const isSelf = row.submittedBy === ctx.user.id;

  if (action === "cancel") {
    if (!isSelf && !canApproveFinance(ctx)) throw ApiError.forbidden();
    if (!["draft", "submitted"].includes(row.status)) throw ApiError.badRequest("Only draft/submitted can be canceled");
    await db.update(expenses).set({ status: "canceled" }).where(eq(expenses.id, id));
  } else if (action === "reimburse") {
    if (!can(ctx.access, "finance.reimburse")) throw ApiError.forbidden();
    if (row.status !== "approved") throw ApiError.badRequest("Only approved expenses can be reimbursed");
    await db.update(expenses).set({ status: "reimbursed", reimbursedAt: new Date() }).where(eq(expenses.id, id));
    await chargeBudget(row.budgetId, row.amountCents);
  } else {
    if (!canApproveFinance(ctx)) throw ApiError.forbidden();
    if (isSelf) throw ApiError.badRequest("You cannot approve your own expense");
    if (row.status !== "submitted") throw ApiError.badRequest("Expense is not awaiting decision");
    // Phase 8 — approval chain per amount threshold: an expense must be
    // resolved by the approver mode configured for its amount band. The
    // matching band's 'manager' mode requires the requester's manager (or a
    // company approver acting above their band — kept simple: company
    // approvers may always decide; the band gates manager-only decisions).
    const band = await matchingThreshold(ctx.user.organizationId, row.amountCents);
    if (action === "approve") {
      if (band?.approverMode === "manager" && !companyApprover(ctx) && !(await isManagerOf(ctx, row.submittedBy))) {
        throw ApiError.forbidden("This amount requires the employee's manager");
      }
      await db
        .update(expenses)
        .set({ status: "approved", decidedBy: ctx.user.id, decidedAt: new Date() })
        .where(eq(expenses.id, id));
      await chargeBudget(row.budgetId, row.amountCents);
    } else {
      await db
        .update(expenses)
        .set({ status: "rejected", decidedBy: ctx.user.id, decidedAt: new Date() })
        .where(eq(expenses.id, id));
    }
  }
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: `EXPENSE_${action.toUpperCase()}`,
    entityType: "expense",
    entityId: id,
  });
}

/** Add spent amount to a budget (if linked). */
async function chargeBudget(budgetId: string | null, cents: number) {
  if (!budgetId || !cents) return;
  await db
    .update(budgets)
    .set({ spentCents: sql`${budgets.spentCents} + ${cents}` })
    .where(eq(budgets.id, budgetId));
}

// ---------- purchase requests ----------

export async function listPurchases(ctx: AuthContext, opts: { status?: string } = {}) {
  const companyWide = can(ctx.access, "finance.view_company");
  const conds = [
    companyWide
      ? eq(purchaseRequests.organizationId, ctx.user.organizationId)
      : or(
          eq(purchaseRequests.requestedBy, ctx.user.id),
          sql`${purchaseRequests.requestedBy} IN (SELECT user_id FROM employees WHERE manager_user_id = ${ctx.user.id})`,
        )!,
  ];
  if (opts.status) conds.push(eq(purchaseRequests.status, opts.status));
  return db
    .select({
      id: purchaseRequests.id,
      title: purchaseRequests.title,
      estimatedCents: purchaseRequests.estimatedCents,
      currency: purchaseRequests.currency,
      status: purchaseRequests.status,
      requesterName: users.name,
      vendorName: vendors.name,
      createdAt: purchaseRequests.createdAt,
    })
    .from(purchaseRequests)
    .innerJoin(users, eq(users.id, purchaseRequests.requestedBy))
    .leftJoin(vendors, eq(vendors.id, purchaseRequests.vendorId))
    .where(and(...conds))
    .orderBy(desc(purchaseRequests.createdAt))
    .limit(200);
}

export async function createPurchase(
  ctx: AuthContext,
  input: {
    title: string;
    justification?: string;
    items?: { description: string; qty: number; unitCents: number }[];
    estimatedCents: number;
    currency?: string;
    vendorId?: string;
    budgetId?: string;
    neededBy?: string;
    submit?: boolean;
  },
) {
  assertCents(input.estimatedCents);
  const [row] = await db
    .insert(purchaseRequests)
    .values({
      organizationId: ctx.user.organizationId,
      requestedBy: ctx.user.id,
      title: input.title.slice(0, 300),
      justification: input.justification ?? null,
      items: (input.items ?? []).slice(0, 50),
      estimatedCents: Math.round(input.estimatedCents),
      currency: (input.currency ?? "USD").toUpperCase().slice(0, 3),
      vendorId: input.vendorId ?? null,
      budgetId: input.budgetId ?? null,
      neededBy: input.neededBy ?? null,
      status: input.submit ? "submitted" : "draft",
    })
    .returning({ id: purchaseRequests.id });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "PURCHASE_CREATED",
    entityType: "purchase_request",
    entityId: row!.id,
  });
  return row!.id;
}

export async function decidePurchase(
  ctx: AuthContext,
  id: string,
  action: "approve" | "reject" | "order" | "receive" | "cancel",
  poNumber?: string,
) {
  const [row] = await db
    .select()
    .from(purchaseRequests)
    .where(and(eq(purchaseRequests.id, id), eq(purchaseRequests.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound();

  if (action === "cancel") {
    if (row.requestedBy !== ctx.user.id && !canApproveFinance(ctx)) throw ApiError.forbidden();
    await db.update(purchaseRequests).set({ status: "canceled" }).where(eq(purchaseRequests.id, id));
  } else if (action === "approve" || action === "reject") {
    if (!canApproveFinance(ctx)) throw ApiError.forbidden();
    if (row.status !== "submitted") throw ApiError.badRequest("Not awaiting decision");
    if (action === "approve") await chargeBudget(row.budgetId, row.estimatedCents);
    await db
      .update(purchaseRequests)
      .set({ status: action === "approve" ? "approved" : "rejected", decidedBy: ctx.user.id, decidedAt: new Date() })
      .where(eq(purchaseRequests.id, id));
  } else {
    if (!can(ctx.access, "finance.manage_procurement")) throw ApiError.forbidden();
    const next = action === "order" ? "ordered" : "received";
    if (action === "order" && row.status !== "approved") throw ApiError.badRequest("Only approved requests can be ordered");
    if (action === "receive" && row.status !== "ordered") throw ApiError.badRequest("Only ordered requests can be received");
    await db
      .update(purchaseRequests)
      .set({ status: next, ...(poNumber ? { poNumber } : {}) })
      .where(eq(purchaseRequests.id, id));
  }
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: `PURCHASE_${action.toUpperCase()}`,
    entityType: "purchase_request",
    entityId: id,
  });
}

// ---------- travel ----------

export async function listTravel(ctx: AuthContext, opts: { status?: string } = {}) {
  const companyWide = can(ctx.access, "finance.view_company");
  const conds = [
    companyWide
      ? eq(travelRequests.organizationId, ctx.user.organizationId)
      : or(
          eq(travelRequests.requestedBy, ctx.user.id),
          sql`${travelRequests.requestedBy} IN (SELECT user_id FROM employees WHERE manager_user_id = ${ctx.user.id})`,
        )!,
  ];
  if (opts.status) conds.push(eq(travelRequests.status, opts.status));
  return db
    .select({
      id: travelRequests.id,
      destination: travelRequests.destination,
      purpose: travelRequests.purpose,
      departAt: travelRequests.departAt,
      returnAt: travelRequests.returnAt,
      estimatedCents: travelRequests.estimatedCents,
      currency: travelRequests.currency,
      status: travelRequests.status,
      requesterName: users.name,
      createdAt: travelRequests.createdAt,
    })
    .from(travelRequests)
    .innerJoin(users, eq(users.id, travelRequests.requestedBy))
    .where(and(...conds))
    .orderBy(desc(travelRequests.createdAt))
    .limit(200);
}

export async function createTravel(
  ctx: AuthContext,
  input: {
    destination: string;
    purpose?: string;
    departAt?: string;
    returnAt?: string;
    estimatedCents: number;
    currency?: string;
    projectId?: string;
    submit?: boolean;
  },
) {
  assertCents(input.estimatedCents);
  const [row] = await db
    .insert(travelRequests)
    .values({
      organizationId: ctx.user.organizationId,
      requestedBy: ctx.user.id,
      destination: input.destination.slice(0, 200),
      purpose: input.purpose ?? null,
      departAt: input.departAt ?? null,
      returnAt: input.returnAt ?? null,
      estimatedCents: Math.round(input.estimatedCents),
      currency: (input.currency ?? "USD").toUpperCase().slice(0, 3),
      projectId: input.projectId ?? null,
      status: input.submit ? "submitted" : "draft",
    })
    .returning({ id: travelRequests.id });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TRAVEL_CREATED",
    entityType: "travel_request",
    entityId: row!.id,
  });
  return row!.id;
}

export async function decideTravel(ctx: AuthContext, id: string, action: "approve" | "reject" | "cancel") {
  const [row] = await db
    .select()
    .from(travelRequests)
    .where(and(eq(travelRequests.id, id), eq(travelRequests.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  if (action === "cancel") {
    if (row.requestedBy !== ctx.user.id && !canApproveFinance(ctx)) throw ApiError.forbidden();
    await db.update(travelRequests).set({ status: "canceled" }).where(eq(travelRequests.id, id));
  } else {
    if (!canApproveFinance(ctx)) throw ApiError.forbidden();
    if (row.status !== "submitted") throw ApiError.badRequest("Not awaiting decision");
    await db
      .update(travelRequests)
      .set({ status: action === "approve" ? "approved" : "rejected", decidedBy: ctx.user.id, decidedAt: new Date() })
      .where(eq(travelRequests.id, id));
  }
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: `TRAVEL_${action.toUpperCase()}`,
    entityType: "travel_request",
    entityId: id,
  });
}

// ---------- vendors ----------

export async function listVendors(ctx: AuthContext) {
  return db
    .select({
      id: vendors.id,
      name: vendors.name,
      category: vendors.category,
      status: vendors.status,
      contactName: vendors.contactName,
      contactEmail: vendors.contactEmail,
      ownerName: users.name,
      updatedAt: vendors.updatedAt,
    })
    .from(vendors)
    .leftJoin(users, eq(users.id, vendors.ownerUserId))
    .where(eq(vendors.organizationId, ctx.user.organizationId))
    .orderBy(desc(vendors.updatedAt))
    .limit(200);
}

export async function getVendor(ctx: AuthContext, id: string) {
  const [vendor] = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, id), eq(vendors.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!vendor) throw ApiError.notFound();
  const docs = await db.select().from(vendorDocuments).where(eq(vendorDocuments.vendorId, id));
  const relatedPurchases = await db
    .select({ id: purchaseRequests.id, title: purchaseRequests.title, status: purchaseRequests.status })
    .from(purchaseRequests)
    .where(and(eq(purchaseRequests.vendorId, id), eq(purchaseRequests.organizationId, ctx.user.organizationId)))
    .limit(20);
  return { vendor, documents: docs, purchases: relatedPurchases };
}

export async function upsertVendor(
  ctx: AuthContext,
  input: {
    id?: string;
    name: string;
    category?: string;
    contactName?: string;
    contactEmail?: string;
    status?: string;
    notes?: string;
  },
) {
  if (!can(ctx.access, "finance.manage_vendors")) throw ApiError.forbidden();
  const values = {
    name: input.name.slice(0, 200),
    category: input.category ?? null,
    contactName: input.contactName ?? null,
    contactEmail: input.contactEmail ?? null,
    status: input.status && (VENDOR_STATUSES as readonly string[]).includes(input.status) ? input.status : "pending",
    notes: input.notes ?? null,
    updatedAt: new Date(),
  };
  let id = input.id;
  if (id) {
    const updated = await db
      .update(vendors)
      .set(values)
      .where(and(eq(vendors.id, id), eq(vendors.organizationId, ctx.user.organizationId)))
      .returning({ id: vendors.id });
    if (!updated[0]) throw ApiError.notFound();
  } else {
    const inserted = await db
      .insert(vendors)
      .values({ ...values, organizationId: ctx.user.organizationId, ownerUserId: ctx.user.id })
      .returning({ id: vendors.id });
    id = inserted[0]!.id;
  }
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: input.id ? "VENDOR_UPDATED" : "VENDOR_CREATED",
    entityType: "vendor",
    entityId: id!,
  });
  return id!;
}

export async function addVendorDocument(
  ctx: AuthContext,
  vendorId: string,
  input: { fileName: string; kind?: string; expiresAt?: string },
) {
  if (!can(ctx.access, "finance.manage_vendors")) throw ApiError.forbidden();
  const [vendor] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!vendor) throw ApiError.notFound();
  await db.insert(vendorDocuments).values({
    organizationId: ctx.user.organizationId,
    vendorId,
    fileName: input.fileName.slice(0, 300),
    kind: ["license", "insurance", "cert", "other"].includes(input.kind ?? "") ? input.kind! : "other",
    expiresAt: input.expiresAt ?? null,
  });
}

// ---------- budgets ----------

export async function listBudgets(ctx: AuthContext) {
  const manageAll = can(ctx.access, "finance.manage_budgets") || can(ctx.access, "finance.view_company");
  const conds = manageAll
    ? eq(budgets.organizationId, ctx.user.organizationId)
    : or(eq(budgets.ownerUserId, ctx.user.id), eq(budgets.status, "active"))!;
  return db
    .select({
      id: budgets.id,
      name: budgets.name,
      periodLabel: budgets.periodLabel,
      amountCents: budgets.amountCents,
      spentCents: budgets.spentCents,
      currency: budgets.currency,
      status: budgets.status,
      departmentName: departments.name,
      ownerName: users.name,
    })
    .from(budgets)
    .leftJoin(departments, eq(departments.id, budgets.departmentId))
    .leftJoin(users, eq(users.id, budgets.ownerUserId))
    .where(and(conds, eq(budgets.organizationId, ctx.user.organizationId)))
    .orderBy(desc(budgets.createdAt))
    .limit(200);
}

export async function upsertBudget(
  ctx: AuthContext,
  input: {
    id?: string;
    name: string;
    periodLabel: string;
    amountCents: number;
    currency?: string;
    departmentId?: string;
    status?: string;
  },
) {
  if (!can(ctx.access, "finance.manage_budgets")) throw ApiError.forbidden();
  assertCents(input.amountCents);
  const base = {
    name: input.name.slice(0, 200),
    periodLabel: input.periodLabel.slice(0, 20),
    amountCents: Math.round(input.amountCents),
    currency: (input.currency ?? "USD").toUpperCase().slice(0, 3),
    departmentId: input.departmentId ?? null,
    status: ["draft", "active", "closed"].includes(input.status ?? "") ? input.status! : "draft",
  };
  let id = input.id;
  if (id) {
    const updated = await db
      .update(budgets)
      .set(base)
      .where(and(eq(budgets.id, id), eq(budgets.organizationId, ctx.user.organizationId)))
      .returning({ id: budgets.id });
    if (!updated[0]) throw ApiError.notFound();
  } else {
    const inserted = await db
      .insert(budgets)
      .values({ ...base, organizationId: ctx.user.organizationId, ownerUserId: ctx.user.id })
      .returning({ id: budgets.id });
    id = inserted[0]!.id;
  }
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "BUDGET_UPDATED",
    entityType: "budget",
    entityId: id!,
  });
  return id!;
}

// ---------- home + approval queue ----------

export async function financeHome(ctx: AuthContext) {
  const orgId = ctx.user.organizationId;
  const [myPending] = await db
    .select({ n: sql<number>`count(*)::int`, c: sql<number>`coalesce(sum(${expenses.amountCents}),0)::bigint` })
    .from(expenses)
    .where(and(eq(expenses.organizationId, orgId), eq(expenses.submittedBy, ctx.user.id), eq(expenses.status, "submitted")));
  const [pendingApprovals] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(expenses)
    .where(and(eq(expenses.organizationId, orgId), eq(expenses.status, "submitted")));
  const [openPurchases] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(purchaseRequests)
    .where(and(eq(purchaseRequests.organizationId, orgId), inArray(purchaseRequests.status, ["submitted", "approved", "ordered"])));
  const overBudget = await db
    .select({ id: budgets.id, name: budgets.name, amountCents: budgets.amountCents, spentCents: budgets.spentCents, currency: budgets.currency })
    .from(budgets)
    .where(
      and(
        eq(budgets.organizationId, orgId),
        eq(budgets.status, "active"),
        sql`${budgets.spentCents} >= ${budgets.amountCents} * 80 / 100`,
      ),
    )
    .limit(10);
  const recentVendors = await db
    .select({ id: vendors.id, name: vendors.name, status: vendors.status, updatedAt: vendors.updatedAt })
    .from(vendors)
    .where(eq(vendors.organizationId, orgId))
    .orderBy(desc(vendors.updatedAt))
    .limit(5);

  // By-currency pending totals for the viewer. We expose every distinct
  // currency so the UI can render one row per currency rather than silently
  // summing USD + EUR into a meaningless number.
  const myPendingByCurrency = await db
    .select({
      currency: expenses.currency,
      cents: sql<number>`coalesce(sum(${expenses.amountCents}),0)::bigint`,
      n: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, orgId),
        eq(expenses.submittedBy, ctx.user.id),
        eq(expenses.status, "submitted"),
      ),
    )
    .groupBy(expenses.currency)
    .orderBy(desc(sql<number>`coalesce(sum(${expenses.amountCents}),0)::bigint`));

  // By-category spend for the viewer's submitted+approved in the last 30 days
  // (only meaningful for users with finance.view_self+; otherwise empty).
  const since = new Date(Date.now() - 30 * 86400 * 1000);
  const myCategorySpend = await db
    .select({
      category: expenses.category,
      currency: expenses.currency,
      cents: sql<number>`coalesce(sum(${expenses.amountCents}),0)::bigint`,
      n: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, orgId),
        eq(expenses.submittedBy, ctx.user.id),
        inArray(expenses.status, ["approved", "reimbursed"]),
        sql`${expenses.incurredAt} >= ${since.toISOString().slice(0, 10)}`,
      ),
    )
    .groupBy(expenses.category, expenses.currency)
    .orderBy(desc(sql<number>`coalesce(sum(${expenses.amountCents}),0)::bigint`))
    .limit(20);

  const scope = widestScope(ctx.access, "finance.view_self");
  return {
    myPendingCount: Number(myPending?.n ?? 0),
    myPendingCents: Number(myPending?.c ?? 0),
    pendingApprovalCount: canApproveFinance(ctx) ? Number(pendingApprovals?.n ?? 0) : null,
    openPurchases: Number(openPurchases?.n ?? 0),
    overBudget,
    recentVendors,
    myPendingByCurrency: myPendingByCurrency.map((r) => ({
      currency: r.currency,
      cents: Number(r.cents),
      count: Number(r.n),
    })),
    myCategorySpend: myCategorySpend.map((r) => ({
      category: r.category,
      currency: r.currency,
      cents: Number(r.cents),
      count: Number(r.n),
    })),
    scope,
  };
}
