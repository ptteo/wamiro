/**
 * Service Catalog (F2.3) — D6 §12–14. Employee-facing catalog of services;
 * each item routes through the existing requests/approvals engine, and items
 * flagged `auto_create_ticket` spawn a support ticket once the request is
 * fully approved (via the `request.approved` domain-event consumer).
 */
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { notify } from "@/modules/notifications/service";
import { requestTypes, requests, serviceItems, users } from "@/db/schema";
import { can } from "@/modules/iam/engine";

const CATEGORIES = new Set([
  "access",
  "hardware",
  "software",
  "accounts",
  "security",
  "facilities",
  "travel",
  "other",
]);

function requireManage(ctx: AuthContext) {
  if (!can(ctx.access, "services.manage")) throw ApiError.forbidden("Missing permission: services.manage");
}

// ---------- employee-facing ----------

export async function listCatalog(ctx: AuthContext) {
  return db
    .select({
      id: serviceItems.id,
      name: serviceItems.name,
      description: serviceItems.description,
      category: serviceItems.category,
      icon: serviceItems.icon,
      expectedDays: serviceItems.expectedDays,
      approvalRequired: serviceItems.approvalRequired,
    })
    .from(serviceItems)
    .where(and(eq(serviceItems.organizationId, ctx.user.organizationId), eq(serviceItems.active, true)))
    .orderBy(asc(serviceItems.sortOrder), asc(serviceItems.name));
}

/**
 * Request a service. Items requiring approval go through the requests engine
 * (manager/company workflow); items that don't need approval create a ticket
 * immediately so IT execution is instant.
 */
export async function requestService(
  ctx: AuthContext,
  itemId: string,
  details: string,
): Promise<{ kind: "request" | "ticket"; id: string }> {
  const [item] = await db
    .select()
    .from(serviceItems)
    .where(and(eq(serviceItems.id, itemId), eq(serviceItems.organizationId, ctx.user.organizationId), eq(serviceItems.active, true)))
    .limit(1);
  if (!item) throw ApiError.notFound("Service not found");

  if (!item.approvalRequired) {
    const { createTicketRecord } = await import("@/modules/tickets/service");
    const row = await createTicketRecord(ctx.user.organizationId, ctx.user.id, {
      title: `Service request: ${item.name}`,
      description: (details || "Requested from the service catalog.").slice(0, 10_000),
      category: item.category === "security" ? "incident" : "service_request",
      priority: item.category === "security" ? "high" : "medium",
    });
    await audit({
      organizationId: ctx.user.organizationId,
      actorUserId: ctx.user.id,
      action: "SERVICE_REQUESTED_DIRECT",
      entityType: "ticket",
      entityId: row.id,
      newValue: { service: item.name },
    });
    return { kind: "ticket", id: row.id };
  }

  // ensure a request type exists for this service (idempotent, per org)
  const slug = `svc_${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "service"}`;
  const [existingType] = await db
    .select({ id: requestTypes.id })
    .from(requestTypes)
    .where(and(eq(requestTypes.organizationId, ctx.user.organizationId), eq(requestTypes.key, slug)))
    .limit(1);
  let typeId = existingType?.id;
  if (!typeId) {
    const inserted = await db
      .insert(requestTypes)
      .values({
        organizationId: ctx.user.organizationId,
        key: slug,
        name: item.name,
        description: item.description?.slice(0, 300) ?? null,
        fields: [{ key: "details", label: "Details", type: "textarea", required: true }],
        approverMode: "manager",
        steps: [],
        active: true,
      })
      .onConflictDoNothing()
      .returning({ id: requestTypes.id });
    typeId = inserted[0]?.id;
  }
  if (!typeId) {
    const [retry] = await db
      .select({ id: requestTypes.id })
      .from(requestTypes)
      .where(and(eq(requestTypes.organizationId, ctx.user.organizationId), eq(requestTypes.key, slug)))
      .limit(1);
    typeId = retry?.id;
  }
  if (!typeId) throw new Error("Could not resolve request type");

  // keep the item pointing at its type (first request wins)
  await db
    .update(serviceItems)
    .set({ requestTypeId: typeId, updatedAt: new Date() })
    .where(and(eq(serviceItems.id, item.id), eq(serviceItems.organizationId, ctx.user.organizationId)));

  const { apply } = await import("@/modules/requests/service");
  const req = await apply(ctx, { typeId, payload: { details: (details || "").slice(0, 5000) } });
  return { kind: "request", id: req.id };
}

// ---------- admin ----------

export async function listForAdmin(ctx: AuthContext) {
  requireManage(ctx);
  return db
    .select({
      id: serviceItems.id,
      name: serviceItems.name,
      description: serviceItems.description,
      category: serviceItems.category,
      icon: serviceItems.icon,
      expectedDays: serviceItems.expectedDays,
      approvalRequired: serviceItems.approvalRequired,
      autoCreateTicket: serviceItems.autoCreateTicket,
      active: serviceItems.active,
      sortOrder: serviceItems.sortOrder,
      createdAt: serviceItems.createdAt,
    })
    .from(serviceItems)
    .where(eq(serviceItems.organizationId, ctx.user.organizationId))
    .orderBy(asc(serviceItems.sortOrder), asc(serviceItems.name));
}

export async function createItem(
  ctx: AuthContext,
  input: {
    name: string;
    description?: string;
    category?: string;
    icon?: string;
    expectedDays?: number | null;
    approvalRequired?: boolean;
    autoCreateTicket?: boolean;
    sortOrder?: number;
  },
) {
  requireManage(ctx);
  const category = input.category && CATEGORIES.has(input.category) ? input.category : "other";
  const inserted = await db
    .insert(serviceItems)
    .values({
      organizationId: ctx.user.organizationId,
      name: input.name.trim().slice(0, 120),
      description: input.description?.trim().slice(0, 500) || null,
      category,
      icon: input.icon?.trim().slice(0, 40) || null,
      expectedDays: input.expectedDays != null ? Math.min(Math.max(Math.round(input.expectedDays), 0), 365) : null,
      approvalRequired: input.approvalRequired !== false,
      autoCreateTicket: !!input.autoCreateTicket,
      sortOrder: Math.min(Math.max(input.sortOrder ?? 0, 0), 1000),
    })
    .returning({ id: serviceItems.id });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "SERVICE_ITEM_CREATED",
    entityType: "service_item",
    entityId: inserted[0]!.id,
    newValue: { name: input.name, category },
  });
  return inserted[0]!;
}

export async function updateItem(
  ctx: AuthContext,
  id: string,
  input: Partial<{
    name: string;
    description: string | null;
    category: string;
    icon: string | null;
    expectedDays: number | null;
    approvalRequired: boolean;
    autoCreateTicket: boolean;
    active: boolean;
    sortOrder: number;
  }>,
) {
  requireManage(ctx);
  const patch: Partial<typeof serviceItems.$inferSelect> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim().slice(0, 120);
  if (input.description !== undefined) patch.description = input.description?.trim().slice(0, 500) || null;
  if (input.category !== undefined) patch.category = CATEGORIES.has(input.category) ? input.category : "other";
  if (input.icon !== undefined) patch.icon = input.icon?.trim().slice(0, 40) || null;
  if (input.expectedDays !== undefined) {
    patch.expectedDays = input.expectedDays != null ? Math.min(Math.max(Math.round(input.expectedDays), 0), 365) : null;
  }
  if (input.approvalRequired !== undefined) patch.approvalRequired = input.approvalRequired;
  if (input.autoCreateTicket !== undefined) patch.autoCreateTicket = input.autoCreateTicket;
  if (input.active !== undefined) patch.active = input.active;
  if (input.sortOrder !== undefined) patch.sortOrder = Math.min(Math.max(input.sortOrder, 0), 1000);
  const updated = await db
    .update(serviceItems)
    .set(patch)
    .where(and(eq(serviceItems.id, id), eq(serviceItems.organizationId, ctx.user.organizationId)))
    .returning({ id: serviceItems.id });
  if (!updated[0]) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "SERVICE_ITEM_UPDATED",
    entityType: "service_item",
    entityId: id,
    newValue: { name: patch.name },
  });
}

// ---------- approved-request → ticket hook (event consumer) ----------

/**
 * Called by the `request.approved` domain-event consumer. When the approved
 * request type belongs to a catalog item flagged `auto_create_ticket`, spawn
 * the IT execution ticket on the requester's behalf and notify them.
 */
export async function handleApprovedServiceRequest(
  organizationId: string,
  requestId: string,
): Promise<void> {
  const [req] = await db
    .select({ id: requests.id, requesterId: requests.requesterId, typeId: requests.typeId })
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.organizationId, organizationId)))
    .limit(1);
  if (!req?.typeId) return;

  const [item] = await db
    .select({ id: serviceItems.id, name: serviceItems.name, autoCreateTicket: serviceItems.autoCreateTicket })
    .from(serviceItems)
    .where(and(eq(serviceItems.organizationId, organizationId), eq(serviceItems.requestTypeId, req.typeId)))
    .limit(1);
  if (!item?.autoCreateTicket) return;

  const [requester] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, req.requesterId))
    .limit(1);
  if (!requester) return;

  const { createTicketRecord } = await import("@/modules/tickets/service");
  const ticket = await createTicketRecord(organizationId, requester.id, {
    title: `Service request: ${item.name}`,
    description: `Auto-created after your ${item.name} request was approved.`,
    category: "service_request",
    priority: "medium",
  });
  await notify({
    organizationId,
    userId: requester.id,
    type: "ticket",
    title: `Your ${item.name} request is approved — ticket created`,
    body: "IT has been notified and will execute the request.",
    link: `/tickets/${ticket.id}`,
  });
}