/**
 * AI conversation persistence (Phase D8 §27): conversations survive reloads.
 * Each user only sees their own conversations — tenant + user isolated.
 */
import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { aiConversations, aiMessages } from "@/db/schema";
import type { AuthContext } from "@/lib/session";

export async function listConversations(ctx: AuthContext) {
  return db
    .select({
      id: aiConversations.id,
      title: aiConversations.title,
      createdAt: aiConversations.createdAt,
    })
    .from(aiConversations)
    .where(eq(aiConversations.userId, ctx.user.id))
    .orderBy(desc(aiConversations.createdAt))
    .limit(30);
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
): Promise<{ role: string; content: string }[]> {
  // verify ownership
  const [conv] = await db
    .select({ userId: aiConversations.userId })
    .from(aiConversations)
    .where(eq(aiConversations.id, conversationId))
    .limit(1);
  if (!conv || conv.userId !== ctx.user.id) throw new Error("not_found");

  const rows = await db
    .select({ role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt));
  return rows;
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
