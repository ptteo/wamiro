import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { chatTurn } from "@/modules/ai/chat";
import {
  createConversation,
  getMessages,
  saveMessage,
  updateTitle,
} from "@/modules/ai/conversations";

const bodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
  /**
   * Tool mode:
   *  - undefined (default): use the heuristic — fast no-tools path for
   *    general questions, tools when the user clearly needs company data
   *  - true: force no-tools (lowest latency, useful for "tell me about
   *    all features" type questions)
   *  - false: force tools (when you know the user wants company data)
   */
  noTools: z.union([z.boolean(), z.enum(["auto"])]).optional(),
});

// ponytail: per-instance limiter; shared store only when horizontally scaled
const attempts = new Map<string, { count: number; resetAt: number }>();
function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  rec.count += 1;
  if (rec.count > max) throw ApiError.rateLimited();
}

export const POST = route(async (req: NextRequest, { auth }) => {
  if (!isModuleEnabled(auth.org.modules, "ai")) {
    throw ApiError.forbidden("AI module is disabled for your organization");
  }
  rateLimit(`ai:${auth.user.id}`, 30, 3_600_000);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("messages required", parsed.error.flatten());

  try {
    // resolve or create conversation
    let conversationId = parsed.data.conversationId;
    if (!conversationId) {
      conversationId = await createConversation(auth);
    }

    // persist the user's message before generating a response (§51 durability)
    const lastUser = parsed.data.messages[parsed.data.messages.length - 1];
    if (lastUser) await saveMessage(conversationId, "user", lastUser.content);

    // load prior messages for context continuity
    const history = await getMessages(auth, conversationId);

    // Translate the new noTools field shape into chatTurn's option.
    // undefined → auto (heuristic), true → no tools, false → tools, "auto" → auto.
    const wantsNoTools =
      parsed.data.noTools === true
        ? true
        : parsed.data.noTools === false
          ? false
          : undefined;

    const result = await chatTurn(
      auth,
      history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { noTools: wantsNoTools },
    );

    await saveMessage(conversationId, "assistant", result.answer);

    // auto-title on first exchange
    if (parsed.data.messages.length <= 1) {
      const title = lastUser?.content.slice(0, 60) ?? "New conversation";
      await updateTitle(conversationId, title);
    }

    // Top-level audit: every successful AI query
    await audit({
      organizationId: auth.user.organizationId,
      actorUserId: auth.user.id,
      action: "AI_QUERY",
      entityType: "assistant",
      metadata: {
        turns: parsed.data.messages.length,
        providerMs: result.providerMs,
        toolCount: result.toolCalls.length,
        noToolsAuto: result.noToolsAuto,
      },
    });

    // Per-tool audit. PII / sensitive fields are NOT in the metadata —
    // we log tool name, duration, and whether the call was blocked or
    // had fields redacted. That gives an admin a useful audit trail
    // without leaking answer content.
    for (const t of result.toolCalls) {
      await audit({
        organizationId: auth.user.organizationId,
        actorUserId: auth.user.id,
        action: t.blocked ? "AI_TOOL_BLOCKED" : "AI_TOOL_CALLED",
        entityType: "ai_tool",
        metadata: {
          tool: t.name,
          durationMs: t.durationMs,
          redactedFields: t.redactedFields,
          blockedReason: t.blockedReason,
        },
      }).catch(() => {});
    }

    if (result.promptInjectionBlocked > 0) {
      await audit({
        organizationId: auth.user.organizationId,
        actorUserId: auth.user.id,
        action: "AI_PROMPT_INJECTION_BLOCKED",
        entityType: "assistant",
        metadata: { count: result.promptInjectionBlocked },
      }).catch(() => {});
    }

    if (result.redaction.redactionCount > 0) {
      await audit({
        organizationId: auth.user.organizationId,
        actorUserId: auth.user.id,
        action: "AI_ANSWER_REDACTED",
        entityType: "assistant",
        metadata: { counts: result.redaction.counts },
      }).catch(() => {});
    }

    return NextResponse.json({
      answer: result.answer,
      citations: result.citations,
      conversationId,
      // tells the client whether we used the prefetched self-data
      // ("prefetched_only") or actually called a tool ("tools" /
      // "auto_tools") or skipped tools entirely ("no_tools" /
      // "auto_no_tools")
      mode: result.mode,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message.slice(0, 120) : "unknown";

    if (e instanceof Error && e.message === "AI_NOT_CONFIGURED") {
      return NextResponse.json(
        {
          error: {
            code: "not_configured",
            message: "The assistant is not available on this deployment yet.",
            request_id: "n/a",
          },
        },
        { status: 503 },
      );
    }

    // Classify provider-side failures so the client can show an
    // accurate, actionable message instead of a generic "unavailable".
    let status = 503;
    let code = "assistant_unavailable";
    let message = "The assistant is temporarily unavailable. Please retry shortly.";
    let retryHint: string | null = null;
    if (e instanceof Error) {
      if (e.message.startsWith("provider_timeout_")) {
        status = 504;
        code = "assistant_timeout";
        message = "The assistant is taking longer than expected. Try again, or ask without company-data lookup.";
        retryHint = "try_no_tools";
      } else if (e.message.startsWith("provider_rate_limited_")) {
        status = 429;
        code = "assistant_rate_limited";
        message = "The assistant is rate-limited right now. Please wait a moment and try again.";
        retryHint = "wait";
      } else if (e.message.startsWith("provider_upstream_")) {
        code = "assistant_upstream";
        message = "The model provider is having trouble. Please retry shortly.";
      } else if (e.message.startsWith("provider_bad_request_")) {
        status = 400;
        code = "assistant_bad_request";
        message = "The assistant rejected the request. Try rephrasing.";
      }
    }

    await audit({
      organizationId: auth.user.organizationId,
      actorUserId: auth.user.id,
      action: "AI_FAILED",
      entityType: "assistant",
      metadata: { reason, code },
    }).catch(() => {});

    return NextResponse.json(
      { error: { code, message, retry_hint: retryHint, request_id: "n/a" } },
      { status },
    );
  }
});
