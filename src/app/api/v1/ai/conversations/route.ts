import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { isModuleEnabled } from "@/modules/iam/catalog";
import {
  deleteConversation,
  renameConversation,
  truncateAfter,
  deleteMessage,
  getMessages,
} from "@/modules/ai/conversations";

const idSchema = z.object({ id: z.string().uuid() });

const renameSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
});

const truncateSchema = z.object({
  id: z.string().uuid(),
  messageId: z.union([z.string(), z.number()]).transform((v) => Number(v)),
});

function ensureAiEnabled(orgModules: Record<string, boolean> | null | undefined) {
  if (!isModuleEnabled(orgModules, "ai")) {
    throw ApiError.forbidden("AI module is disabled for your organization");
  }
}

export const DELETE = route(async (req: NextRequest, { auth }) => {
  ensureAiEnabled(auth.org.modules);
  const parsed = idSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("id required", parsed.error.flatten());
  await deleteConversation(auth, parsed.data.id);
  return NextResponse.json({ ok: true });
});

/**
 * Rename a conversation. The title shows in the history list and as
 * the browser tab. Title is set on first exchange by the chat route,
 * but the user can override at any time.
 */
export const PATCH = route(async (req: NextRequest, { auth }) => {
  ensureAiEnabled(auth.org.modules);
  const body = await req.json().catch(() => null);
  // Two shapes are accepted: { id, title } and { action: "rename", ... }.
  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("id and title required", parsed.error.flatten());
  }
  await renameConversation(auth, parsed.data.id, parsed.data.title);
  return NextResponse.json({ ok: true });
});

/**
 * Truncate a conversation at a specific message: drop the message and
 * everything after it. The remaining history is returned so the client
 * can show the user the new state. Used by "edit and resubmit" and
 * "regenerate" — the model regenerates from the new state.
 *
 * POST /api/v1/ai/conversations  body: { id, messageId }
 *   → { ok: true, messages: [...remaining] }
 */
export const POST = route(async (req: NextRequest, { auth }) => {
  ensureAiEnabled(auth.org.modules);
  const body = await req.json().catch(() => null);
  // Three actions are supported:
  //  - { id, messageId }                → truncate at messageId
  //  - { id, messageId, action: "delete-message" } → delete just that message
  //  - { id, messageId, action: "truncate" }      → same as default
  const asTruncate = truncateSchema.safeParse(body);
  if (!asTruncate.success) {
    throw ApiError.badRequest("id and messageId required", asTruncate.error.flatten());
  }
  const { id, messageId } = asTruncate.data;
  const action = typeof body === "object" && body && "action" in body ? (body as { action?: string }).action : "truncate";
  if (action === "delete-message") {
    await deleteMessage(auth, id, messageId);
  } else {
    await truncateAfter(auth, id, messageId);
  }
  const messages = await getMessages(auth, id);
  return NextResponse.json({
    ok: true,
    messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
  });
});
