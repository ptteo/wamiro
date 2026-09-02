import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { streamChatTurn } from "@/modules/ai/chat";
import type { StreamChunk } from "@/modules/ai/chat";
import type { AuthContext } from "@/lib/session";
import {
  createConversation,
  getMessages,
  saveMessage,
  updateTitle,
} from "@/modules/ai/conversations";

export const maxDuration = 180;

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
   *  - true: force no-tools (lowest latency)
   *  - false: force tools
   */
  noTools: z.union([z.boolean(), z.enum(["auto"])]).optional(),
  /**
   * Streaming:
   *  - true (default for browser clients): emit newline-delimited JSON
   *    events (token, tool_start, tool_end, citations, mode, done).
   *  - false (used by automated tests): collect the full response and
   *    return it as a single JSON object.
   */
  stream: z.boolean().optional(),
});

// Per-instance rate limiter; shared store only when horizontally scaled.
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

type ParsedBody = z.SafeParseSuccess<z.infer<typeof bodySchema>>;
type ParsedData = z.infer<typeof bodySchema>;

export const POST = route(async (req: NextRequest, { auth }) => {
  if (!isModuleEnabled(auth.org.modules, "ai")) {
    throw ApiError.forbidden("AI module is disabled for your organization");
  }
  // Anti-abuse only. Does not model any provider RPM (including 15/min).
  // Set AI_CHAT_RATE_LIMIT_PER_HOUR=0 to disable. Fast providers are not throttled extra.
  const perHour = Number(process.env.AI_CHAT_RATE_LIMIT_PER_HOUR ?? 1000);
  if (perHour > 0) rateLimit(`ai:${auth.user.id}`, perHour, 3_600_000);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("messages required", parsed.error.flatten());

  // Resolve or create conversation
  let conversationId = parsed.data.conversationId;
  if (!conversationId) {
    conversationId = await createConversation(auth);
  }

  // Persist the user's message before generating a response (§51 durability)
  const lastUser = parsed.data.messages[parsed.data.messages.length - 1];
  if (lastUser) await saveMessage(conversationId, "user", lastUser.content);

  // Load prior messages for context continuity
  const history = await getMessages(auth, conversationId);

  const wantsNoTools =
    parsed.data.noTools === true
      ? true
      : parsed.data.noTools === false
        ? false
        : undefined;

  // Streaming vs JSON. Default: streaming. Pass `stream: false` for
  // a buffered JSON response (used by automated tests and curl).
  const wantsStream = parsed.data.stream !== false;

  const baseCtx: RunCtx = {
    auth,
    conversationId,
    history,
    wantsNoTools,
    parsed,
    lastUser,
  };

  if (wantsStream) {
    return buildStreamingResponse({ req, ctx: baseCtx });
  }
  return buildBufferedResponse({ ctx: baseCtx });
});

interface RunCtx {
  auth: AuthContext;
  conversationId: string;
  history: { role: string; content: string }[];
  wantsNoTools: boolean | undefined;
  parsed: ParsedBody;
  lastUser: { role: "user" | "assistant"; content: string } | undefined;
}

async function buildStreamingResponse({ req, ctx }: { req: NextRequest; ctx: RunCtx }): Promise<Response> {
  const { auth, conversationId, history, wantsNoTools, parsed, lastUser } = ctx;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: StreamChunk) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
        } catch {
          // controller closed (client aborted) — ignore
        }
      };
      const onAbort = () => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", onAbort);
      try {
        let finalAnswer = "";
        for await (const chunk of streamChatTurn(
          auth,
          conversationId,
          history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          { noTools: wantsNoTools, signal: req.signal },
        )) {
          if (chunk.type === "token") {
            finalAnswer += chunk.content;
          } else if (chunk.type === "done") {
            await persistAndAudit({
              auth,
              conversationId,
              parsed: parsed.data,
              lastUser,
              finalAnswer: chunk.redaction.text || finalAnswer,
              doneChunk: chunk,
            });
          }
          send(chunk);
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      } catch (e) {
        await handleStreamingError({
          controller,
          send,
          auth,
          conversationId,
          e,
        });
      } finally {
        req.signal.removeEventListener("abort", onAbort);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Conversation-Id": conversationId,
    },
  });
}

async function buildBufferedResponse({ ctx }: { ctx: RunCtx }): Promise<Response> {
  const { auth, conversationId, history, wantsNoTools, parsed, lastUser } = ctx;
  try {
    let finalAnswer = "";
    let finalDone: Extract<StreamChunk, { type: "done" }> | null = null;
    for await (const chunk of streamChatTurn(
      auth,
      conversationId,
      history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { noTools: wantsNoTools },
    )) {
      if (chunk.type === "token") {
        finalAnswer += chunk.content;
      } else if (chunk.type === "done") {
        finalDone = chunk;
        await persistAndAudit({
          auth,
          conversationId,
          parsed: parsed.data,
          lastUser,
          finalAnswer: chunk.redaction.text || finalAnswer,
          doneChunk: chunk,
        });
      }
    }
    return NextResponse.json(
      {
        ok: true,
        conversationId,
        answer: (finalDone?.redaction.text || finalAnswer) ?? "",
        mode: finalDone?.mode ?? "no_tools",
        providerMs: finalDone?.providerMs ?? 0,
        toolCalls: finalDone?.toolCalls ?? 0,
        redaction: finalDone?.redaction,
        promptInjectionBlocked: finalDone?.promptInjectionBlocked ?? 0,
      },
      { headers: { "X-Conversation-Id": conversationId } },
    );
  } catch (e) {
    return handleBufferedError({ auth, e, conversationId });
  }
}

async function persistAndAudit({
  auth,
  conversationId,
  parsed,
  lastUser,
  finalAnswer,
  doneChunk,
}: {
  auth: AuthContext;
  conversationId: string;
  parsed: ParsedData;
  lastUser: { role: "user" | "assistant"; content: string } | undefined;
  finalAnswer: string;
  doneChunk: Extract<StreamChunk, { type: "done" }>;
}) {
  if (finalAnswer) {
    await saveMessage(conversationId, "assistant", finalAnswer);
  }
  if (parsed.messages.length <= 1) {
    const title = lastUser?.content.slice(0, 60) ?? "New conversation";
    await updateTitle(conversationId, title);
  }
  await audit({
    organizationId: auth.user.organizationId,
    actorUserId: auth.user.id,
    action: "AI_QUERY",
    entityType: "assistant",
    metadata: {
      turns: parsed.messages.length,
      providerMs: doneChunk.providerMs,
      toolCount: doneChunk.toolCalls,
      mode: doneChunk.mode,
    },
  });
  if (doneChunk.promptInjectionBlocked > 0) {
    await audit({
      organizationId: auth.user.organizationId,
      actorUserId: auth.user.id,
      action: "AI_PROMPT_INJECTION_BLOCKED",
      entityType: "assistant",
      metadata: { count: doneChunk.promptInjectionBlocked },
    }).catch(() => {});
  }
  if (doneChunk.redaction.redactionCount > 0) {
    await audit({
      organizationId: auth.user.organizationId,
      actorUserId: auth.user.id,
      action: "AI_ANSWER_REDACTED",
      entityType: "assistant",
      metadata: { counts: doneChunk.redaction.counts },
    }).catch(() => {});
  }
}

async function handleStreamingError({
  controller,
  send,
  auth,
  conversationId: _conversationId,
  e,
}: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  send: (chunk: StreamChunk) => void;
  auth: AuthContext;
  conversationId: string;
  e: unknown;
}) {
  const { code, message, retryHint } = classifyFullError(e);
  const reason = e instanceof Error ? e.message.slice(0, 120) : "unknown";
  send({ type: "error", code, message, retryHint });
  await audit({
    organizationId: auth.user.organizationId,
    actorUserId: auth.user.id,
    action: "AI_FAILED",
    entityType: "assistant",
    metadata: { reason, code },
  }).catch(() => {});
  try {
    controller.close();
  } catch {
    /* already closed */
  }
}

async function handleBufferedError({
  auth,
  e,
  conversationId,
}: {
  auth: AuthContext;
  e: unknown;
  conversationId: string;
}): Promise<Response> {
  const { code, message, status, retryHint } = classifyFullError(e);
  const reason = e instanceof Error ? e.message.slice(0, 120) : "unknown";
  await audit({
    organizationId: auth.user.organizationId,
    actorUserId: auth.user.id,
    action: "AI_FAILED",
    entityType: "assistant",
    metadata: { reason, code },
  }).catch(() => {});
  return NextResponse.json(
    { error: { code, message, retry_hint: retryHint, request_id: "n/a" } },
    { status, headers: { "X-Conversation-Id": conversationId } },
  );
}

function classifyFullError(e: unknown): {
  code: string;
  message: string;
  status: number;
  retryHint: string | null;
} {
  if (e instanceof Error && e.message === "AI_NOT_CONFIGURED") {
    return {
      code: "not_configured",
      message: "The assistant is not available on this deployment yet.",
      status: 503,
      retryHint: null,
    };
  }
  if (e instanceof Error) {
    if (e.message.startsWith("provider_timeout_")) {
      return {
        code: "assistant_timeout",
        message:
          "The assistant is taking longer than expected. You can stop and try again, or ask without company-data lookup.",
        status: 503,
        retryHint: "try_no_tools",
      };
    }
    if (e.message.startsWith("provider_rate_limited_")) {
      return {
        code: "assistant_rate_limited",
        message: "The assistant is rate-limited right now. Please wait a moment and try again.",
        status: 429,
        retryHint: "wait",
      };
    }
    if (e.message.startsWith("provider_upstream_")) {
      return {
        code: "assistant_upstream",
        message: "The model provider is having trouble. Please retry shortly.",
        status: 503,
        retryHint: null,
      };
    }
    if (e.message.startsWith("provider_transport_")) {
      return {
        code: "assistant_unavailable",
        message: "Could not reach the model provider. Please retry shortly.",
        status: 503,
        retryHint: "retry",
      };
    }
  }
  return {
    code: "assistant_unavailable",
    message: "The assistant is temporarily unavailable. Please retry shortly.",
    status: 503,
    retryHint: null,
  };
}
