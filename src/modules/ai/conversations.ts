/**
 * AI conversation persistence (Phase D8 §27): conversations survive reloads.
 * Each user only sees their own conversations — tenant + user isolated.
 */
import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { aiConversations, aiMessages } from "@/db/schema";
import type { AuthContext } from "@/lib/session";

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: Date;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  messageCount: number;
}

export async function listConversations(ctx: AuthContext): Promise<ConversationSummary[]> {
  // Use a single query that joins with the latest message via a LATERAL subquery.
  const rows = await db.execute(sql`
    SELECT
      c.id,
      c.title,
      c.created_at AS "createdAt",
      lm.content AS "lastMessagePreview",
      lm.created_at AS "lastMessageAt",
      COALESCE(mc.cnt, 0)::int AS "messageCount"
    FROM ai_conversations c
    LEFT JOIN LATERAL (
      SELECT content, created_at
      FROM ai_messages
      WHERE conversation_id = c.id
      ORDER BY created_at DESC
      LIMIT 1
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt
      FROM ai_messages
      WHERE conversation_id = c.id
    ) mc ON true
    WHERE c.user_id = ${ctx.user.id}
    ORDER BY c.created_at DESC
    LIMIT 30
  `);
  return (rows.rows as unknown as Array<{
    id: string;
    title: string | null;
    createdAt: string | Date;
    lastMessagePreview: string | null;
    lastMessageAt: string | Date | null;
    messageCount: number;
  }>).map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: new Date(r.createdAt),
    lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt) : null,
    lastMessagePreview: r.lastMessagePreview,
    messageCount: Number(r.messageCount),
  }));
}

export async function createConversation(ctx: AuthContext): Promise<string> {
  const inserted = await db
    .insert(aiConversations)
    .values({ organizationId: ctx.user.organizationId, userId: ctx.user.id })
    .returning({ id: aiConversations.id });
  if (!inserted[0]) throw new Error("Insert returned no row");
  return inserted[0].id;
}

export async function getMessages(
  ctx: AuthContext,
  conversationId: string,
): Promise<{ id: number; role: string; content: string; createdAt: string }[]> {
  // verify ownership
  const [conv] = await db
    .select({ userId: aiConversations.userId })
    .from(aiConversations)
    .where(eq(aiConversations.id, conversationId))
    .limit(1);
  if (!conv || conv.userId !== ctx.user.id) throw new Error("not_found");

  const rows = await db
    .select({
      id: aiMessages.id,
      role: aiMessages.role,
      content: aiMessages.content,
      createdAt: aiMessages.createdAt,
    })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt));
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function saveMessage(
  conversationId: string,
  role: string,
  content: string,
): Promise<void> {
  await db.insert(aiMessages).values({ conversationId, role, content });
}

export async function updateTitle(conversationId: string, title: string): Promise<void> {
  await db.update(aiConversations).set({ title }).where(eq(aiConversations.id, conversationId));
}

export async function deleteConversation(ctx: AuthContext, id: string): Promise<void> {
  await db
    .delete(aiConversations)
    .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, ctx.user.id)));
}

/**
 * Rename a conversation. The user must own the conversation; the
 * service verifies ownership via the userId predicate.
 */
export async function renameConversation(
  ctx: AuthContext,
  id: string,
  title: string,
): Promise<void> {
  await db
    .update(aiConversations)
    .set({ title: title.slice(0, 200) })
    .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, ctx.user.id)));
}

/**
 * Truncate a conversation: drop every message after (and including)
 * the message with the given id, then return the messages that
 * remain. Used by "edit and resubmit" — the user changes a prior
 * message, we drop everything after it, and the model regenerates
 * from that point.
 */
export async function truncateAfter(
  ctx: AuthContext,
  conversationId: string,
  messageId: number,
): Promise<void> {
  // verify ownership
  const [conv] = await db
    .select({ userId: aiConversations.userId })
    .from(aiConversations)
    .where(eq(aiConversations.id, conversationId))
    .limit(1);
  if (!conv || conv.userId !== ctx.user.id) throw new Error("not_found");

  await db.execute(sql`
    DELETE FROM ai_messages
    WHERE conversation_id = ${conversationId}::uuid
      AND created_at >= (
        SELECT created_at FROM ai_messages
        WHERE id = ${messageId}
        LIMIT 1
      )
  `);
}

/**
 * Delete a single message within a conversation. Used when the user
 * clicks "delete" on a message.
 */
export async function deleteMessage(
  ctx: AuthContext,
  conversationId: string,
  messageId: number,
): Promise<void> {
  const [conv] = await db
    .select({ userId: aiConversations.userId })
    .from(aiConversations)
    .where(eq(aiConversations.id, conversationId))
    .limit(1);
  if (!conv || conv.userId !== ctx.user.id) throw new Error("not_found");

  await db.execute(sql`
    DELETE FROM ai_messages
    WHERE id = ${messageId}
      AND conversation_id = ${conversationId}::uuid
  `);
}
