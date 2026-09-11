import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { emit } from "@/lib/events";
import type { AuthContext } from "@/lib/session";
import { notify } from "@/modules/notifications/service";
import { resolveApprovalActors } from "@/modules/approvals/delegation";
import { employees, requestTypes, requests, users } from "@/db/schema";
import type { RequestTypeField, WorkflowStepDef } from "@/db/schema";

import { can, widestScope } from "@/modules/iam/engine";

// ---------- types ----------

/** Active types for the employee form. Approval `steps` override `approverMode` at submit time (`review`); not listed here. */
export async function listTypes(ctx: AuthContext) {
  return db
    .select({
      id: requestTypes.id,
      key: requestTypes.key,
      name: requestTypes.name,
      description: requestTypes.description,
      fields: requestTypes.fields,
    })
    .from(requestTypes)
    .where(
      and(
        eq(requestTypes.organizationId, ctx.user.organizationId),
        eq(requestTypes.active, true),
      ),
    )
    .orderBy(requestTypes.name);
}

export interface TypeFieldInput {
  key?: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select";
  required?: boolean;
  options?: string[];
  /** Phase 8 — conditional visibility */
  visibleIf?: { key: string; values?: string[] };
}

export interface WorkflowStepInput {
  label: string;
  approverMode: "manager" | "company";
}

function validateSteps(steps: WorkflowStepInput[] | undefined): WorkflowStepDef[] {
  if (!steps) return [];
  return steps.slice(0, 5).map((s) => ({
    label: s.label.trim().slice(0, 80),
    approverMode: s.approverMode === "company" ? "company" : "manager",
  }));
}

/** Resolve who may act on a given workflow step for this requester. */
async function resolveStepApprovers(
  ctx: AuthContext,
  step: { approverMode: string },
): Promise<string[]> {
  if (step.approverMode === "manager") {
    const [mgr] = await db
      .select({ id: employees.managerUserId })
      .from(employees)
      .where(and(eq(employees.userId, ctx.user.id), eq(employees.organizationId, ctx.user.organizationId)))
      .limit(1);
    return mgr?.id ? [mgr.id] : [];
  }
  // company: everyone holding requests.approve at COMPANY/GLOBAL
  const rows = await db.execute(sql`
    SELECT DISTINCT ur.user_id AS id
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE rp.permission = 'requests.approve'
      AND rp.scope IN ('COMPANY', 'GLOBAL')
      AND ur.user_id <> ${ctx.user.id}
  `);
  return (rows.rows as unknown as { id: string }[]).map((r) => r.id);
}

const FIELD_TYPES = new Set(["text", "textarea", "number", "date", "select"]);

function validateFieldDefs(fields: TypeFieldInput[]): RequestTypeField[] {
  const seen = new Set<string>();
  const out: RequestTypeField[] = [];
  for (const f of fields.slice(0, 12)) {
    // key falls back to the slug of the label Ã¢â‚¬â€ the admin UI sends labels only
    const key =
      (f.key ?? f.label)
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || `field_${out.length + 1}`;
    if (seen.has(key)) throw ApiError.badRequest(`Duplicate field key: ${key}`);
    seen.add(key);
    if (!FIELD_TYPES.has(f.type)) throw ApiError.badRequest(`Invalid field type: ${f.type}`);
    if (f.type === "select" && (!f.options || f.options.length < 2)) {
      throw ApiError.badRequest("Select fields need at least two options");
    }
    out.push({
      key,
      label: f.label.trim().slice(0, 80),
      type: f.type,
      required: !!f.required,
      options: f.type === "select" ? f.options!.slice(0, 12).map((o) => o.trim()).filter(Boolean) : undefined,
      visibleIf: f.visibleIf?.key ? { key: f.visibleIf.key.slice(0, 40), values: f.visibleIf.values?.slice(0, 12) } : undefined,
    });
  }
  return out;
}

/** Admin list including inactive types. */
export async function listTypesForAdmin(ctx: AuthContext) {
  if (!can(ctx.access, "requests.manage")) {
    throw ApiError.forbidden("Missing permission: requests.manage");
  }
  return db
    .select({
      id: requestTypes.id,
      key: requestTypes.key,
      name: requestTypes.name,
      description: requestTypes.description,
      fields: requestTypes.fields,
      approverMode: requestTypes.approverMode,
      slaHours: requestTypes.slaHours,
      steps: requestTypes.steps,
      active: requestTypes.active,
    })
    .from(requestTypes)
    .where(eq(requestTypes.organizationId, ctx.user.organizationId))
    .orderBy(requestTypes.name);
}

export async function createType(
  ctx: AuthContext,
  input: {
    key?: string;
    name: string;
    description?: string | null;
    fields: TypeFieldInput[];
    approverMode?: string;
    steps?: WorkflowStepInput[];
    slaHours?: number | null;
  },
) {
  if (!can(ctx.access, "requests.manage")) {
    throw ApiError.forbidden("Missing permission: requests.manage");
  }
  const slugKey =
    (input.key ?? input.name)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
  if (!slugKey) throw ApiError.badRequest("Could not derive a valid key");

  const existing = await db
    .select({ id: requestTypes.id })
    .from(requestTypes)
    .where(
      and(eq(requestTypes.organizationId, ctx.user.organizationId), eq(requestTypes.key, slugKey)),
    )
    .limit(1);
  if (existing[0]) throw ApiError.conflict("A request type with this key already exists");

  const approverMode = input.approverMode === "company" ? "company" : "manager";
  const steps = validateSteps(input.steps);

  const inserted = await db
    .insert(requestTypes)
    .values({
      organizationId: ctx.user.organizationId,
      key: slugKey,
      name: input.name.trim().slice(0, 80),
      description: input.description?.trim().slice(0, 300) || null,
      fields: validateFieldDefs(input.fields),
      approverMode,
      steps,
      slaHours: input.slaHours ?? null,
    })
    .returning({ id: requestTypes.id });
  const row = inserted[0];
  if (!row) throw new Error("Insert returned no row");

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "REQUEST_TYPE_CREATED",
    entityType: "request_type",
    entityId: row.id,
    newValue: { key: slugKey, name: input.name, approverMode },
  });
  return row;
}

export async function updateType(
  ctx: AuthContext,
  typeId: string,
  input: {
    name: string;
    description?: string | null;
    fields: TypeFieldInput[];
    approverMode?: string;
    steps?: WorkflowStepInput[];
    slaHours?: number | null;
  },
) {
  if (!can(ctx.access, "requests.manage")) {
    throw ApiError.forbidden("Missing permission: requests.manage");
  }
  const fields = validateFieldDefs(input.fields);
  const steps = validateSteps(input.steps);
  const approverMode = input.approverMode === "company" ? "company" : "manager";

  const updated = await db
    .update(requestTypes)
    .set({
      name: input.name.trim().slice(0, 80),
      description: input.description?.trim().slice(0, 300) || null,
      fields,
      approverMode,
      steps,
      slaHours: input.slaHours ?? null,
    })
    .where(
      and(eq(requestTypes.id, typeId), eq(requestTypes.organizationId, ctx.user.organizationId)),
    )
    .returning({ id: requestTypes.id });
  if (!updated[0]) throw ApiError.notFound();

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "REQUEST_TYPE_UPDATED",
    entityType: "request_type",
    entityId: typeId,
    newValue: { name: input.name },
  });
}

/** Soft-deactivate: history is preserved for existing requests. */
export async function deactivateType(ctx: AuthContext, typeId: string) {
  if (!can(ctx.access, "requests.manage")) {
    throw ApiError.forbidden("Missing permission: requests.manage");
  }
  const updated = await db
    .update(requestTypes)
    .set({ active: false })
    .where(
      and(
        eq(requestTypes.id, typeId),
        eq(requestTypes.organizationId, ctx.user.organizationId),
      ),
    )
    .returning({ id: requestTypes.id });
  if (!updated[0]) throw ApiError.notFound();

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "REQUEST_TYPE_DEACTIVATED",
    entityType: "request_type",
    entityId: typeId,
  });
}

// ---------- apply ----------

function validatePayload(fields: RequestTypeField[], payload: Record<string, unknown>) {
  const out: Record<string, string | number | null> = {};
  // Phase 8 — conditional fields: a field with `visibleIf: {key, values?}` is
  // only expected/required when the trigger field's value matches (or is
  // non-empty when `values` is omitted). Hidden fields are dropped, not
  // rejected, so stale client state never blocks submission.
  const isFieldVisible = (f: RequestTypeField): boolean => {
    const cond = f.visibleIf;
    if (!cond) return true;
    const trigger = payload[cond.key];
    if (cond.values && Array.isArray(cond.values) && cond.values.length > 0) {
      return cond.values.map(String).includes(String(trigger));
    }
    return trigger !== undefined && trigger !== null && trigger !== "";
  };
  for (const f of fields) {
    if (!isFieldVisible(f)) continue;
    const raw = payload[f.key];
    if (raw === undefined || raw === null || raw === "") {
      if (f.required) throw ApiError.badRequest(`"${f.label}" is required`);
      out[f.key] = null;
      continue;
    }
    switch (f.type) {
      case "number": {
        const n = Number(raw);
        if (!Number.isFinite(n)) throw ApiError.badRequest(`"${f.label}" must be a number`);
        out[f.key] = n;
        break;
      }
      case "select":
        if (!f.options?.includes(String(raw))) {
          throw ApiError.badRequest(`"${f.label}" has an invalid choice`);
        }
        out[f.key] = String(raw);
        break;
      default:
        if (typeof raw !== "string" && typeof raw !== "number") {
          throw ApiError.badRequest(`"${f.label}" is invalid`);
        }
        if (String(raw).length > 5000) throw ApiError.badRequest(`"${f.label}" is too long`);
        out[f.key] = String(raw);
    }
  }
  // reject unexpected keys (visible fields only — hidden conditionals are dropped)
  for (const k of Object.keys(payload)) {
    const f = fields.find((x) => x.key === k);
    if (!f || !isFieldVisible(f)) {
      throw ApiError.badRequest(`Unknown field: ${k}`);
    }
  }
  return out;
}

export async function apply(
  ctx: AuthContext,
  input: { typeId: string; payload: Record<string, unknown> },
) {
  if (!can(ctx.access, "requests.apply")) {
    throw ApiError.forbidden("Missing permission: requests.apply");
  }

  const [type] = await db
    .select({
      id: requestTypes.id,
      key: requestTypes.key,
      name: requestTypes.name,
      fields: requestTypes.fields,
      approverMode: requestTypes.approverMode,
      slaHours: requestTypes.slaHours,
      steps: requestTypes.steps,
    })
    .from(requestTypes)
    .where(
      and(
        eq(requestTypes.id, input.typeId),
        eq(requestTypes.organizationId, ctx.user.organizationId),
        eq(requestTypes.active, true),
      ),
    )
    .limit(1);
  if (!type) throw ApiError.notFound("Request type not found");

  const payload = validatePayload(type.fields, input.payload);

  const inserted = await db
    .insert(requests)
    .values({
      organizationId: ctx.user.organizationId,
      typeId: type.id,
      slaDueAt: type.slaHours && type.slaHours > 0 ? new Date(Date.now() + type.slaHours * 3_600_000) : null,
      requesterId: ctx.user.id,
      payload,
    })
    .returning({ id: requests.id });
  const req = inserted[0];
  if (!req) throw new Error("Insert returned no row");

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "REQUEST_CREATED",
    entityType: "request",
    entityId: req.id,
    newValue: { type: type.key },
  });
  await emit(ctx.user.organizationId, "request.created", "request", req.id, ctx.user.id, { type: type.key });

  let approverIds: string[] = [];
  const firstStep = type.steps?.[0];
  if (firstStep) {
    approverIds = await resolveStepApprovers(ctx, firstStep);
  } else if (type.approverMode === "company") {
    const rows = await db.execute(sql`
      SELECT DISTINCT ur.user_id AS id
      FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN users u ON u.id = ur.user_id
      WHERE u.organization_id = ${ctx.user.organizationId}
        AND rp.permission = 'requests.approve'
        AND rp.scope IN ('COMPANY', 'GLOBAL')
        AND ur.user_id <> ${ctx.user.id}
    `);
    approverIds = rows.rows.map((r) => String((r as Record<string, unknown>)["id"]));
  } else {
    approverIds = (
      await db
        .select({ id: employees.managerUserId })
        .from(employees)
        .where(and(eq(employees.userId, ctx.user.id), eq(employees.organizationId, ctx.user.organizationId)))
        .limit(1)
    )
      .map((r) => r.id)
      .filter((id): id is string => !!id);
  }

  for (const uid of [...new Set(approverIds)]) {
    await notify({
      organizationId: ctx.user.organizationId,
      userId: uid,
      type: "request.created",
      title: `${ctx.user.name} submitted a ${type.name} request`,
      link: "/approvals",
    });
  }

  // automation rules lite (blueprint Ã‚Â§26): fire-and-forget evaluation
  const { evaluateRequestCreated } = await import("@/modules/automations/service");
  void evaluateRequestCreated(ctx.user.organizationId, { id: ctx.user.id, name: ctx.user.name }, type.id, payload);

  return req;
}

// ---------- views ----------

/** Decisions already made by this reviewer, newest first. */
export async function listReviewedByMe(ctx: AuthContext) {
  return db
    .select({
      id: requests.id,
      userName: users.name,
      userAvatar: users.avatarUrl,
      typeName: requestTypes.name,
      payload: requests.payload,
      status: requests.status,
      reviewNote: requests.reviewNote,
      reviewedAt: requests.reviewedAt,
    })
    .from(requests)
    .innerJoin(users, eq(users.id, requests.requesterId))
    .innerJoin(requestTypes, eq(requestTypes.id, requests.typeId))
    .where(
      and(
        eq(requests.organizationId, ctx.user.organizationId),
        eq(requests.reviewedBy, ctx.user.id),
      ),
    )
    .orderBy(desc(requests.reviewedAt))
    .limit(50);
}

export async function myRequests(ctx: AuthContext) {
  return db
    .select({
      id: requests.id,
      typeId: requests.typeId,
      typeName: requestTypes.name,
      payload: requests.payload,
      status: requests.status,
      reviewNote: requests.reviewNote,
      slaDueAt: requests.slaDueAt,
      escalatedAt: requests.escalatedAt,
      currentStep: requests.currentStep,
      reviewedBy: requests.reviewedBy,
      reviewedAt: requests.reviewedAt,
      createdAt: requests.createdAt,
    })
    .from(requests)
    .innerJoin(requestTypes, eq(requestTypes.id, requests.typeId))
    .where(
      and(
        eq(requests.organizationId, ctx.user.organizationId),
        eq(requests.requesterId, ctx.user.id),
      ),
    )
    .orderBy(desc(requests.createdAt))
    .limit(50);
}

/** Pending generic requests this user can act on (chain-aware). */
export async function pendingForApprover(ctx: AuthContext) {
  if (!can(ctx.access, "requests.approve")) return [];
  const orgId = ctx.user.organizationId;
  const scope = widestScope(ctx.access, "requests.approve");
  const companyWide = scope === "COMPANY" || scope === "GLOBAL";

  // Ã‚Â§27 delegation: include queues of delegators-to-me (never wider than
  // the delegate's own scope Ã¢â‚¬â€ non-company viewers stay manager-scoped).
  const actorIds = [ctx.user.id, ...(await resolveApprovalActors(ctx))];
  const actorParam = `{${actorIds.join(",")}}`;

  const rows = await db
    .select({
      id: requests.id,
      typeName: requestTypes.name,
      typeId: requests.typeId,
      requesterName: users.name,
      requesterId: requests.requesterId,
      requesterAvatar: users.avatarUrl,
      requesterManagerId: employees.managerUserId,
      steps: requestTypes.steps,
      currentStep: requests.currentStep,
      payload: requests.payload,
      slaDueAt: requests.slaDueAt,
      escalatedAt: requests.escalatedAt,
      createdAt: requests.createdAt,
    })
    .from(requests)
    .innerJoin(requestTypes, eq(requestTypes.id, requests.typeId))
    .innerJoin(users, eq(users.id, requests.requesterId))
    .leftJoin(employees, eq(employees.userId, requests.requesterId))
    .where(
      companyWide
        ? and(eq(requests.organizationId, orgId), eq(requests.status, "pending"))
        : and(
            eq(requests.organizationId, orgId),
            eq(requests.status, "pending"),
            sql`${requests.requesterId} IN (SELECT user_id FROM employees WHERE manager_user_id = ANY(${actorParam}::uuid[]))`,
          ),
    )
    .orderBy(desc(requests.createdAt))
    .limit(50);

  // keep only requests whose CURRENT step this viewer may act on
  return rows.filter((r) => {
    const chain =
      Array.isArray(r.steps) && r.steps.length > 0
        ? r.steps
        : [{ label: "Approval", approverMode: "manager" as const }];
    const idx = Math.min(r.currentStep, chain.length - 1);
    const mode = chain[idx]?.approverMode ?? "manager";
    if (mode === "company") return companyWide;
    return r.requesterManagerId !== null && actorIds.includes(r.requesterManagerId);
  });
}

// ---------- review ----------

/** Requester withdraws their own pending request. */
export async function withdraw(ctx: AuthContext, requestId: string) {
  const orgId = ctx.user.organizationId;
  const [req] = await db
    .select({
      id: requests.id,
      requesterId: requests.requesterId,
      status: requests.status,
      typeName: requestTypes.name,
    })
    .from(requests)
    .innerJoin(requestTypes, eq(requestTypes.id, requests.typeId))
    .where(and(eq(requests.id, requestId), eq(requests.organizationId, orgId)))
    .limit(1);
  if (!req) throw ApiError.notFound();
  if (req.requesterId !== ctx.user.id) {
    throw ApiError.forbidden("Only the requester can withdraw a request");
  }
  if (req.status !== "pending") {
    throw ApiError.conflict("Only pending requests can be withdrawn");
  }

  await db
    .update(requests)
    .set({ status: "cancelled", reviewedAt: new Date(), reviewedBy: ctx.user.id })
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")));

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "REQUEST_WITHDRAWN",
    entityType: "request",
    entityId: requestId,
  });
  await emit(
    orgId,
    "request.cancelled",
    "request",
    requestId,
    ctx.user.id,
    { type: req.typeName },
  );
}

export async function review(
  ctx: AuthContext,
  requestId: string,
  decision: "approved" | "rejected",
  note?: string,
) {
  if (!can(ctx.access, "requests.approve")) {
    throw ApiError.forbidden("Missing permission: requests.approve");
  }
  const orgId = ctx.user.organizationId;
  const scope = widestScope(ctx.access, "requests.approve");
  const companyWide = scope === "COMPANY" || scope === "GLOBAL";

  const [req] = await db
    .select({
      id: requests.id,
      requesterId: requests.requesterId,
      status: requests.status,
      currentStep: requests.currentStep,
      approvedSteps: requests.approvedSteps,
      steps: requestTypes.steps,
      legacyApproverMode: requestTypes.approverMode,
      typeName: requestTypes.name,
    })
    .from(requests)
    .innerJoin(requestTypes, eq(requestTypes.id, requests.typeId))
    .where(and(eq(requests.id, requestId), eq(requests.organizationId, orgId)))
    .limit(1);
  if (!req) throw ApiError.notFound();
  if (req.status !== "pending") throw ApiError.conflict("Already reviewed");

  // resolve the approval chain: explicit steps or legacy single implicit step
  const chain: WorkflowStepDef[] =
    req.steps && req.steps.length > 0
      ? req.steps
      : [{ label: "Approval", approverMode: (req.legacyApproverMode as "manager") ?? "manager" }];
  const stepIndex = Math.min(req.currentStep, chain.length - 1);
  const step = chain[stepIndex]!;
  const isFinal = stepIndex === chain.length - 1;

  if (req.requesterId === ctx.user.id) {
    throw ApiError.forbidden("You cannot act on your own request");
  }

  // per-step authorization
  let authorized = false;
  let delegated = false; // Phase 8 — acting on behalf of a delegator
  if (step.approverMode === "company") {
    authorized = companyWide;
  } else {
    const actorIds = [ctx.user.id, ...(await resolveApprovalActors(ctx))];
    const managerFilter = actorIds.length > 1
      ? or(eq(employees.managerUserId, ctx.user.id), inArray(employees.managerUserId, actorIds))
      : eq(employees.managerUserId, ctx.user.id);
    const [report] = await db
      .select({ userId: employees.userId })
      .from(employees)
      .where(and(eq(employees.userId, req.requesterId), managerFilter))
      .limit(1);
    authorized = !!report;
    // The reviewer is a delegate when the requester's manager is NOT the
    // reviewer but IS one of the reviewer's delegators.
    if (authorized) {
      const [mgr] = await db
        .select({ managerUserId: employees.managerUserId })
        .from(employees)
        .where(and(eq(employees.userId, req.requesterId), eq(employees.organizationId, orgId)))
        .limit(1);
      delegated = !!mgr?.managerUserId && mgr.managerUserId !== ctx.user.id && actorIds.includes(mgr.managerUserId);
    }
  }
  if (!authorized) throw ApiError.forbidden("Not authorized for this approval step");

  if (decision === "rejected") {
    await db
      .update(requests)
      .set({
        status: "rejected",
        reviewedBy: ctx.user.id,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
        decidedByDelegate: delegated,
      })
      .where(and(eq(requests.id, requestId), eq(requests.status, "pending")));

    await audit({
      organizationId: orgId,
      actorUserId: ctx.user.id,
      action: "REQUEST_REJECTED",
      entityType: "request",
      entityId: requestId,
      metadata: { note, stepIndex },
    });
    await notify({
      organizationId: orgId,
      userId: req.requesterId,
      type: "request.rejected",
      title: `Your ${req.typeName} request was rejected by ${ctx.user.name}`,
      body: note ?? null,
      link: "/requests",
    });
    return;
  }

  // approve: record this step; advance or finalize
  const newApprovedSteps = [...req.approvedSteps, { stepIndex, approverId: ctx.user.id }];
  const done = isFinal;

  await db
    .update(requests)
    .set({
      approvedSteps: newApprovedSteps,
      currentStep: done ? req.currentStep : req.currentStep + 1,
      ...(done
        ? {
            status: "approved" as const,
            reviewedBy: ctx.user.id,
            reviewedAt: new Date(),
            reviewNote: note ?? null,
            decidedByDelegate: delegated,
          }
        : {}),
    })
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")));

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: done ? "REQUEST_APPROVED" : "REQUEST_STEP_ADVANCED",
    entityType: "request",
    entityId: requestId,
    newValue: { stepIndex, totalSteps: chain.length },
    metadata: { note },
  });

  if (done) {
    await emit(orgId, "request.approved", "request", requestId, ctx.user.id, {
      type: req.typeName,
      requesterId: req.requesterId,
    });
    await notify({
      organizationId: orgId,
      userId: req.requesterId,
      type: "request.approved",
      title: `Your ${req.typeName} request was fully approved`,
      body: note ?? null,
      link: "/requests",
    });
  } else {
    const nextApprovers = await resolveNextStepApprovers(
      orgId,
      req.requesterId,
      chain[stepIndex + 1]!,
      ctx.user.id,
    );
    for (const uid of nextApprovers) {
      await notify({
        organizationId: orgId,
        userId: uid,
        type: "request.step_pending",
        title: `Approval needed: ${req.typeName} (step ${stepIndex + 2}/${chain.length})`,
        link: "/approvals",
      });
    }
  }
}

/** Resolve approvers for a given step of a pending request mid-chain. */
async function resolveNextStepApprovers(
  orgId: string,
  requesterId: string,
  step: WorkflowStepDef,
  excludeUserId: string,
): Promise<string[]> {
  if (step.approverMode === "manager") {
    const rows = await db.execute(sql`
      SELECT manager_user_id AS id FROM employees
      WHERE user_id = ${requesterId} AND organization_id = ${orgId} AND manager_user_id IS NOT NULL
    `);
    return (rows.rows as unknown as { id: string }[]).map((r) => r.id);
  }
  const rows = await db.execute(sql`
    SELECT DISTINCT ur.user_id AS id
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN users u ON u.id = ur.user_id
    WHERE u.organization_id = ${orgId}
      AND rp.permission = 'requests.approve'
      AND rp.scope IN ('COMPANY', 'GLOBAL')
      AND ur.user_id <> ${excludeUserId}
  `);
  return (rows.rows as unknown as { id: string }[]).map((r) => r.id);
}

// ---------- R8 §32: SLA escalation sweep ----------
export async function escalateOverdue(ctx: AuthContext) {
  if (!can(ctx.access, "requests.manage")) throw ApiError.forbidden("Missing permission: requests.manage");
  return escalateOverdueInOrg(ctx.user.organizationId);
}

/**
 * Phase F: org-agnostic request-SLA escalation used by the background jobs
 * worker. `escalated_at` set-once makes repeated runs idempotent.
 */
export async function escalateOverdueInOrg(orgId: string): Promise<number> {
  const orgIdScope = orgId;
  const now = new Date();
  const overdue = await db
    .select({ id: requests.id, requesterId: requests.requesterId, slaDueAt: requests.slaDueAt })
    .from(requests)
    .where(
      and(
        eq(requests.organizationId, orgIdScope),
        eq(requests.status, "pending"),
        lt(requests.slaDueAt, now),
      ),
    )
    .limit(200);
  let escalated = 0;
  for (const r of overdue) {
    const upd = await db
      .update(requests)
      .set({ escalatedAt: now })
      .where(and(eq(requests.id, r.id), isNull(requests.escalatedAt)))
      .returning({ id: requests.id });
    if (!upd[0]) continue; // already escalated
    escalated++;
    await emit(
      orgIdScope,
      "request.created", // reuse manager-routing consumer for the nudge
      "request",
      r.id,
      null,
      { escalated: true },
    );
    // route notification to the requester's manager directly
    const [emp] = await db
      .select({ m: employees.managerUserId })
      .from(employees)
      .where(and(eq(employees.userId, r.requesterId), eq(employees.organizationId, orgIdScope)))
      .limit(1);
    if (emp?.m && emp.m !== r.requesterId) {
      await notify({
        organizationId: orgIdScope,
        userId: emp.m,
        type: "request",
        title: "SLA breached: request overdue",
        body: `Request ${r.id.slice(0, 8)} passed its decision deadline.`,
        link: "/approvals",
      });
    }
  }
  await audit({
    organizationId: orgIdScope,
    actorUserId: null,
    action: "REQUESTS_ESCALATED",
    entityType: "request",
    newValue: { escalated, source: "scheduled_worker" },
  });
  return escalated;
}