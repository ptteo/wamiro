/**
 * Domain event emitter (§50): append-only record of what happened, keyed for
 * future consumers (automation, analytics, integrations). Never throws —
 * events are observability, not control flow.
 */
import { db } from "@/lib/db";
import { domainEvents } from "@/db/schema";

export type DomainEventType =
  | "user.created"
  | "user.invited"
  | "employee.created"
  | "leave.requested"
  | "leave.approved"
  | "leave.rejected"
  | "request.created"
  | "request.approved"
  | "request.rejected"
  | "request.cancelled"
  | "task.created"
  | "task.completed"
  | "document.uploaded"
  | "announcement.published";

export async function emit(
  organizationId: string,
  eventType: DomainEventType,
  entityType: string,
  entityId: string | null,
  actorUserId: string | null,
  payload?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(domainEvents).values({
      organizationId,
      eventType,
      entityType,
      entityId,
      actorUserId,
      payload: payload ?? null,
    });
  } catch (e) {
    console.error(
      JSON.stringify({ level: "error", msg: "event_emit_failed", eventType, err: String(e) }),
    );
    return; // observability failure must never break the business action
  }
  // R6 §33 — fan-out to registered consumers. Each consumer is isolated:
  // its failure is logged and cannot affect siblings or the caller.
  const consumers = CONSUMERS[eventType] ?? [];
  for (const fn of consumers) {
    try {
      await fn({ organizationId, eventType, entityType, entityId, actorUserId, payload });
    } catch (e) {
      console.error(
        JSON.stringify({ level: "error", msg: "event_consumer_failed", eventType, err: String(e) }),
      );
    }
  }
}

export interface DomainEventEnvelope {
  organizationId: string;
  eventType: DomainEventType;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  payload?: Record<string, unknown>;
}

type Consumer = (e: DomainEventEnvelope) => void | Promise<void>;

/** Consumers register here — notifications today; automations/analytics later. */
const CONSUMERS: Partial<Record<DomainEventType, Consumer[]>> = {};

export function onEvent(t: DomainEventType, fn: Consumer) {
  (CONSUMERS[t] ??= []).push(fn);
}
