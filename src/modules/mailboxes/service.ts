/**
 * Email-to-ticket mailboxes (F2.2) — Zammad email-channel parity.
 *
 * An admin connects an IMAP inbox per tenant; the polling worker pulls unseen
 * mail and turns it into tickets/replies via `createTicketRecord` +
 * `addAttachmentRecord` (same code paths as the web UI). Senders must be
 * members of the tenant (matched by email) — unknown senders are skipped and
 * logged. Subject tag `[#<ticket-uuid>]` appends to the existing ticket,
 * otherwise a new ticket is created.
 *
 * Transport: `imapflow` is loaded lazily so the app itself has zero new
 * dependencies — run `npm i imapflow` only when enabling a mailbox. Without
 * it, `pollMailbox` fails with a clear message; the ingestion logic
 * (`ingestMessage`) is fully implemented and unit-tested regardless.
 */
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { mailboxMessages, mailboxes, tickets, users } from "@/db/schema";
import { can } from "@/modules/iam/engine";

function requireAgent(ctx: AuthContext) {
  if (!can(ctx.access, "tickets.manage")) throw ApiError.forbidden("Missing permission: tickets.manage");
}

export interface InboundMessage {
  /** IMAP message id — used for dedupe. */
  messageId: string;
  from: string;
  subject: string;
  text: string;
  attachments: { name: string; mimeType: string; data: Buffer }[];
}

// ---------- admin CRUD ----------

export async function listMailboxes(ctx: AuthContext) {
  requireAgent(ctx);
  const rows = await db
    .select({
      id: mailboxes.id,
      email: mailboxes.email,
      imapHost: mailboxes.imapHost,
      imapPort: mailboxes.imapPort,
      imapUser: mailboxes.imapUser,
      useSsl: mailboxes.useSsl,
      enabled: mailboxes.enabled,
      lastSyncAt: mailboxes.lastSyncAt,
      lastError: mailboxes.lastError,
      createdAt: mailboxes.createdAt,
    })
    .from(mailboxes)
    .where(eq(mailboxes.organizationId, ctx.user.organizationId))
    .orderBy(desc(mailboxes.createdAt));
  return rows; // never exposes imap_pass
}

export async function connectMailbox(
  ctx: AuthContext,
  input: {
    email: string;
    imapHost: string;
    imapPort: number;
    imapUser: string;
    imapPass: string;
    useSsl: boolean;
  },
) {
  requireAgent(ctx);
  const inserted = await db
    .insert(mailboxes)
    .values({
      organizationId: ctx.user.organizationId,
      email: input.email.trim().toLowerCase().slice(0, 200),
      imapHost: input.imapHost.trim().slice(0, 200),
      imapPort: Math.min(Math.max(Math.round(input.imapPort), 1), 65535),
      imapUser: input.imapUser.trim().slice(0, 200),
      imapPass: input.imapPass.slice(0, 500),
      useSsl: input.useSsl !== false,
    })
    .returning({ id: mailboxes.id });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "MAILBOX_CONNECTED",
    entityType: "mailbox",
    entityId: inserted[0]!.id,
    newValue: { email: input.email },
  });
  return inserted[0]!;
}

export async function updateMailbox(
  ctx: AuthContext,
  id: string,
  input: Partial<{
    email: string;
    imapHost: string;
    imapPort: number;
    imapUser: string;
    imapPass: string;
    useSsl: boolean;
    enabled: boolean;
  }>,
) {
  requireAgent(ctx);
  const patch: Partial<typeof mailboxes.$inferSelect> = {};
  if (input.email !== undefined) patch.email = input.email.trim().toLowerCase().slice(0, 200);
  if (input.imapHost !== undefined) patch.imapHost = input.imapHost.trim().slice(0, 200);
  if (input.imapPort !== undefined) patch.imapPort = Math.min(Math.max(Math.round(input.imapPort), 1), 65535);
  if (input.imapUser !== undefined) patch.imapUser = input.imapUser.trim().slice(0, 200);
  if (input.imapPass !== undefined && input.imapPass !== "") patch.imapPass = input.imapPass.slice(0, 500);
  if (input.useSsl !== undefined) patch.useSsl = input.useSsl;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  const updated = await db
    .update(mailboxes)
    .set(patch)
    .where(and(eq(mailboxes.id, id), eq(mailboxes.organizationId, ctx.user.organizationId)))
    .returning({ id: mailboxes.id });
  if (!updated[0]) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "MAILBOX_UPDATED",
    entityType: "mailbox",
    entityId: id,
  });
}

export async function removeMailbox(ctx: AuthContext, id: string) {
  requireAgent(ctx);
  const deleted = await db
    .delete(mailboxes)
    .where(and(eq(mailboxes.id, id), eq(mailboxes.organizationId, ctx.user.organizationId)))
    .returning({ id: mailboxes.id });
  if (!deleted[0]) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "MAILBOX_REMOVED",
    entityType: "mailbox",
    entityId: id,
  });
}

// ---------- ingestion ----------

/**
 * Turn one inbound message into a ticket or reply. Deduped by message id via
 * `idempotency_keys`. Unknown senders are skipped (logged) so a public
 * mailbox can never create users or tickets for non-members.
 */
export async function ingestMessage(
  orgId: string,
  msg: InboundMessage,
): Promise<{ action: "created" | "replied" | "skipped" | "duplicate"; ticketId?: string }> {
  const key = `mail:${msg.messageId.slice(0, 300)}`;
  const dedupe = await db
    .insert(mailboxMessages)
    .values({ messageKey: key, organizationId: orgId, action: "seen" })
    .onConflictDoNothing()
    .returning({ messageKey: mailboxMessages.messageKey });
  if (!dedupe[0]) return { action: "duplicate" };

  const email = (msg.from ?? "").trim().toLowerCase();
  const [sender] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.organizationId, orgId), eq(users.email, email)))
    .limit(1);
  if (!sender) {
    console.log(JSON.stringify({ level: "info", msg: "mail_unknown_sender", orgId, email }));
    return { action: "skipped" };
  }

  const { createTicketRecord, addReplyRecord } = await import("@/modules/tickets/service");
  const { addAttachmentRecord } = await import("@/modules/tickets/attachments");

  // subject tag [#<ticket-id>] → append a reply to that ticket
  const tagMatch = msg.subject.match(/\[#([0-9a-f-]{36})\]/i);
  if (tagMatch?.[1]) {
    const [t] = await db
      .select({ id: tickets.id, requesterId: tickets.requesterId })
      .from(tickets)
      .where(and(eq(tickets.id, tagMatch[1]), eq(tickets.organizationId, orgId)))
      .limit(1);
    if (t && t.requesterId === sender.id) {
      await addReplyRecord(orgId, sender.id, t.id, msg.text.slice(0, 10_000) || "(no text)", false, false);
      for (const a of msg.attachments.slice(0, 5)) {
        await addAttachmentRecord(orgId, sender.id, t.id, a).catch(() => {});
      }
      return { action: "replied", ticketId: t.id };
    }
    // fall through: tag pointed at a ticket the sender can't reply to → new ticket
  }

  const row = await createTicketRecord(orgId, sender.id, {
    title: (msg.subject || "Support email").slice(0, 300),
    description: msg.text.slice(0, 10_000) || "(no text)",
    category: "service_request",
    priority: "medium",
  });
  for (const a of msg.attachments.slice(0, 5)) {
    await addAttachmentRecord(orgId, sender.id, row.id, a).catch(() => {});
  }
  return { action: "created", ticketId: row.id };
}

/**
 * Poll one mailbox over IMAP (lazy `imapflow`). Returns counts. A failure is
 * recorded on the mailbox row so admins see it in the UI.
 */
export async function pollMailbox(mailboxId: string): Promise<{ fetched: number; created: number; replied: number; skipped: number }> {
  const [box] = await db.select().from(mailboxes).where(eq(mailboxes.id, mailboxId)).limit(1);
  if (!box || !box.enabled) return { fetched: 0, created: 0, replied: 0, skipped: 0 };

  // `webpackIgnore` keeps webpack from resolving imapflow at build time:
  // it stays an optional runtime dependency (`npm i imapflow` enables polling).
  const { ImapFlow } = await import(/* webpackIgnore: true */ "imapflow").catch(() => {
    throw new Error("imapflow is not installed — run `npm i imapflow` to enable email-to-ticket");
  });

  const client = new ImapFlow({
    host: box.imapHost,
    port: box.imapPort,
    secure: box.useSsl,
    auth: { user: box.imapUser, pass: box.imapPass },
    logger: false,
  });

  const counts = { fetched: 0, created: 0, replied: 0, skipped: 0 };
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      for await (const msg of client.fetch("1:*", { envelope: true, bodyParts: ["1"], uid: true }, { uid: true })) {
        if (msg.seen) continue;
        const subject = (msg.envelope?.subject as string | undefined) ?? "";
        const from = (msg.envelope?.from?.[0]?.address as string | undefined) ?? "";
        const text = msg.bodyParts?.get("1")?.toString() ?? "";
        const result = await ingestMessage(box.organizationId, {
          messageId: `${box.id}:${msg.uid}`,
          from,
          subject,
          text,
          attachments: [],
        });
        counts.fetched++;
        if (result.action === "created") counts.created++;
        else if (result.action === "replied") counts.replied++;
        else if (result.action === "skipped") counts.skipped++;
        await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
    await db.update(mailboxes).set({ lastSyncAt: new Date(), lastError: null }).where(eq(mailboxes.id, mailboxId));
  } catch (e) {
    await db
      .update(mailboxes)
      .set({ lastError: String(e).slice(0, 500), lastSyncAt: new Date() })
      .where(eq(mailboxes.id, mailboxId));
    throw e;
  } finally {
    await client.logout().catch(() => {});
  }
  return counts;
}

/** Convenience for the worker script: poll every enabled mailbox. */
export async function pollAllMailboxes(): Promise<{ mailboxId: string; counts: { fetched: number; created: number; replied: number; skipped: number } }[]> {
  const boxes = await db.select({ id: mailboxes.id }).from(mailboxes).where(eq(mailboxes.enabled, true));
  const out: { mailboxId: string; counts: { fetched: number; created: number; replied: number; skipped: number } }[] = [];
  for (const b of boxes) {
    try {
      out.push({ mailboxId: b.id, counts: await pollMailbox(b.id) });
    } catch (e) {
      console.error(JSON.stringify({ level: "error", msg: "mailbox_poll_failed", mailboxId: b.id, err: String(e) }));
    }
  }
  return out;
}