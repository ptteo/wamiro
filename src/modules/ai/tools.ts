/**
 * AI tool registry (blueprint §52): AI never touches SQL. Each tool is a
 * typed function executed with the caller's AuthContext, so authorization
 * is enforced by the same services the app itself uses — the AI cannot see
 * more than its user (§53).
 *
 * Hardening (§100, m12+):
 *  - Each tool declares a `sensitivity` ("internal" | "confidential") and
 *    a required `permission` key. The route hides the tool from the model
 *    if the caller lacks the permission.
 *  - Each tool declares an `outputSchema` (zod) — the result is parsed,
 *    dropped fields are pruned, and the result is JSON-stringified for
 *    the model.
 *  - The prompt-injection fence strips lines in tool output that look
 *    like role markers or override instructions.
 */
import { z } from "zod";

import type { AuthContext } from "@/lib/session";
import { ApiError } from "@/lib/errors";
import { can } from "@/modules/iam/engine";
import { pickFields, capText } from "@/lib/redact";
import * as leaveSvc from "@/modules/leave/service";
import * as reqSvc from "@/modules/requests/service";
import * as knowSvc from "@/modules/knowledge/service";
import * as annSvc from "@/modules/announcements/service";
import { overview } from "@/modules/analytics/service";
import { createPlatformSupportTicket, searchHelp } from "@/modules/help/service";

export type Sensitivity = "internal" | "confidential";

/**
 * Tool visibility:
 *  - "self"  — operates only on the caller's own data. Always safe to
 *              declare; the result is grounded in the caller's identity.
 *  - "role"  — operates on other people's data (approvals queue,
 *              workforce, etc.). Only shown when the caller holds the
 *              required permission. Org policy can further opt-out.
 *
 * The route uses this distinction to make the role-based scope
 * unambiguous to the model: a self-only question never needs role
 * tools, and a role-tools question can never be answered without
 * the right role.
 */
export type Visibility = "self" | "role";

export interface ToolDef {
  name: string;
  description: string;
  /** Permission the caller must hold for this tool to be available. */
  permission: string;
  sensitivity: Sensitivity;
  visibility: Visibility;
  /**
   * When true, the route pre-fetches this tool's data and inlines it
   * into the system prompt as ground truth, then hides the tool from
   * the model. Used for the high-frequency "tell me about me" tools
   * (own leave balance, own pending requests) so the user gets a
   * fast no-tools answer.
   */
  prefetchable: boolean;
  parameters: z.ZodTypeAny;
  /**
   * The zod schema of the tool's expected output. Used to validate the
   * tool's return value before it goes back to the model. Any fields
   * not in the schema are dropped (field-allow-list).
   */
  outputSchema: z.ZodTypeAny;
  /** Default-enabled for new orgs (overridable per-org via ai_tool_policies). */
  defaultEnabled: boolean;
  execute: (ctx: AuthContext, args: unknown) => Promise<unknown>;
}

function tool(def: {
  name: string;
  description: string;
  permission: string;
  sensitivity: Sensitivity;
  visibility: Visibility;
  prefetchable: boolean;
  parameters: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  defaultEnabled: boolean;
  execute: (ctx: AuthContext, args: unknown) => Promise<unknown>;
}): ToolDef {
  return def as ToolDef;
}

// ---------- shared output schemas ----------

const WhoAmIOut = z.object({
  name: z.string(),
  email: z.string(),
  organization: z.string(),
  roles: z.array(z.string()),
});
const BalancesOut = z.object({
  balances: z.array(z.object({
    type: z.string(),
    entitled: z.number(),
    used: z.number(),
    remaining: z.number(),
  })),
});
const PendingRequestsOut = z.object({ pending: z.number() });
const AwaitingApprovalOut = z.object({
  leave: z.array(z.object({
    employee: z.string(),
    type: z.string(),
    dates: z.string(),
    days: z.number(),
  })),
  requests: z.array(z.object({
    employee: z.string(),
    type: z.string(),
  })),
});
const KnowledgeSearchOut = z.object({
  results: z.array(z.object({
    id: z.string(),
    title: z.string(),
    snippet: z.string(),
    tags: z.array(z.string()),
  })),
  blocked: z.number(),   // snippets that were stripped by the injection fence
  total: z.number(),
});
const AnnouncementsOut = z.object({
  announcements: z.array(z.object({
    title: z.string(),
    date: z.string(),
  })),
});
const WorkforceOverviewOut = z.object({
  scope: z.string(),
  headcount: z.number(),
  onLeaveToday: z.number(),
  pendingApprovals: z.number(),
  approvalLatencyHours: z.number(),
});
const HelpSearchOut = z.object({
  curated: z.array(z.object({ id: z.string(), title: z.string(), body: z.string(), href: z.string() })),
  knowledge: z.array(z.object({ id: z.string(), title: z.string(), snippet: z.string() })),
});
const SupportTicketOut = z.object({ id: z.string() });

// ---------- the registry ----------

export const TOOLS: ToolDef[] = [
  tool({
    name: "who_am_i",
    description:
      "Get the current user's name, email, roles and organization. Use this first to personalize answers.",
    permission: "ai.use",
    sensitivity: "internal",
    visibility: "self",
    prefetchable: true, // the route injects identity directly into the system prompt
    parameters: z.object({}),
    outputSchema: WhoAmIOut,
    defaultEnabled: true,
    execute: async (ctx) => ({
      name: ctx.user.name,
      email: ctx.user.email,
      organization: ctx.org.name,
      roles: ctx.roleNames,
    }),
  }),
  tool({
    name: "get_my_leave_balances",
    description: "Get the current user's leave balances for this year (entitled vs used days per type).",
    permission: "leave.view_self",
    sensitivity: "internal",
    visibility: "self",
    prefetchable: true, // pre-fetched into the system prompt as ground truth
    parameters: z.object({}),
    outputSchema: BalancesOut,
    defaultEnabled: true,
    execute: async (ctx) => {
      const rows = await leaveSvc.myBalances(ctx);
      return {
        balances: rows.map((b) => ({
          type: b.name,
          entitled: Number(b.entitledDays ?? 0),
          used: Number(b.usedDays ?? 0),
          remaining: Number(b.entitledDays ?? 0) - Number(b.usedDays ?? 0),
        })),
      };
    },
  }),
  tool({
    name: "get_my_pending_requests",
    description: "Count of the current user's own pending leave requests.",
    permission: "leave.view_self",
    sensitivity: "internal",
    visibility: "self",
    prefetchable: true, // pre-fetched; small enough to inline
    parameters: z.object({}),
    outputSchema: PendingRequestsOut,
    defaultEnabled: true,
    execute: async (ctx) => {
      const mine = await leaveSvc.myRequests(ctx);
      return { pending: mine.filter((r) => r.status === "pending").length };
    },
  }),
  tool({
    name: "list_awaiting_my_approval",
    description:
      "List leave and generic requests currently awaiting the current user's approval (only those they may act on). Only available if the caller holds leave.approve or requests.approve.",
    permission: "leave.approve", // OR requests.approve — checked in execute
    sensitivity: "internal",
    visibility: "role",
    prefetchable: false,
    parameters: z.object({}),
    outputSchema: AwaitingApprovalOut,
    defaultEnabled: true,
    execute: async (ctx) => {
      if (!can(ctx.access, "leave.approve") && !can(ctx.access, "requests.approve")) {
        throw ApiError.forbidden("approval permission required");
      }
      const [leaves, reqs] = await Promise.all([
        leaveSvc.pendingForApprover(ctx),
        reqSvc.pendingForApprover(ctx),
      ]);
      return {
        leave: leaves.map((l) => ({
          employee: l.userName,
          type: l.typeName,
          dates: `${l.startDate} to ${l.endDate}`,
          days: Number(l.days),
        })),
        requests: reqs.map((r) => ({ employee: r.requesterName, type: r.typeName })),
      };
    },
  }),
  tool({
    name: "search_company_knowledge",
    description:
      "Search the company knowledge base articles (semantic when embeddings are configured, keyword otherwise). Returns titles, snippets and tags. Snippets are fenced against prompt injection.",
    permission: "knowledge.read",
    sensitivity: "internal",
    visibility: "role",
    prefetchable: false,
    parameters: z.object({ query: z.string().min(2).max(100) }),
    outputSchema: KnowledgeSearchOut,
    defaultEnabled: true,
    execute: async (ctx, args) => {
      const { query } = args as { query: string };
      const like = query.toLowerCase().replace(/[%_]/g, "");
      const hits = await knowSvc.searchArticles(
        ctx.user.organizationId,
        like,
        query,
        5,
      );
      const arts = await knowSvc.list(ctx, 200);
      const byId = new Map(arts.map((a) => [a.id, a]));

      let blocked = 0;
      const results = hits.map((h) => {
        const a = byId.get(h.id);
        const rawSnippet = h.subtitle ?? "";
        const { safe, wasBlocked } = fenceSnippet(rawSnippet);
        if (wasBlocked) blocked++;
        return {
          id: h.id,
          title: h.title,
          snippet: capText(safe, 220),
          tags: a?.tags ?? [],
        };
      });

      return { results, blocked, total: hits.length };
    },
  }),
  tool({
    name: "get_recent_announcements",
    description: "Get the most recent company announcements.",
    permission: "announcements.read",
    sensitivity: "internal",
    visibility: "self",
    prefetchable: true, // pre-fetched; commonly asked
    parameters: z.object({}),
    outputSchema: AnnouncementsOut,
    defaultEnabled: true,
    execute: async (ctx) => ({
      announcements: (await annSvc.listRecent(ctx, 5)).map((a) => ({
        title: a.title,
        date: new Date(a.publishedAt).toLocaleDateString(),
      })),
    }),
  }),
  tool({
    name: "get_workforce_overview",
    description:
      "Headcount, on-leave today, pending approvals and approval latency for the user's team or company, per their access level. Returns an error object if the user lacks analytics permissions. This tool is confidential and may be disabled by your org.",
    permission: "analytics.view",
    sensitivity: "confidential",
    visibility: "role",
    prefetchable: false,
    parameters: z.object({}),
    outputSchema: WorkforceOverviewOut,
    defaultEnabled: false, // opt-in per org
    execute: async (ctx) => {
      const o = await overview(ctx);
      if (!o) throw ApiError.forbidden("no analytics permission");
      return {
        scope: o.scope,
        headcount: o.headcount,
        onLeaveToday: o.onLeaveToday,
        pendingApprovals: o.pendingApprovals,
        approvalLatencyHours: o.approvalLatencyHours,
      };
    },
  }),
  tool({
    name: "help_search",
    description:
      "Search curated Wamiro help (clock in, leave, tickets) and compose with the company knowledge base. Use this for how-to questions.",
    permission: "knowledge.view",
    sensitivity: "internal",
    visibility: "self",
    prefetchable: false,
    parameters: z.object({ query: z.string().min(2).max(100) }),
    outputSchema: HelpSearchOut,
    defaultEnabled: true,
    execute: async (ctx, args) => {
      const { query } = args as { query: string };
      const { curated, knowledge } = await searchHelp(ctx, query);
      return {
        curated: curated.map((a) => ({
          id: a.id,
          title: a.title,
          body: capText(a.body, 280),
          href: a.href,
        })),
        knowledge: knowledge.map((k) => {
          const { safe } = fenceSnippet(k.snippet);
          return { id: k.id, title: k.title, snippet: capText(safe, 220) };
        }),
      };
    },
  }),
  tool({
    name: "create_support_ticket",
    description:
      "Create a Wamiro platform support ticket (not the company's IT queue) when the user needs product help.",
    permission: "tickets.create",
    sensitivity: "internal",
    visibility: "self",
    prefetchable: false,
    parameters: z.object({
      title: z.string().min(3).max(300),
      description: z.string().min(5).max(10_000),
    }),
    outputSchema: SupportTicketOut,
    defaultEnabled: true,
    execute: async (ctx, args) => {
      const { title, description } = args as { title: string; description: string };
      const row = await createPlatformSupportTicket(ctx, { title, description });
      return { id: row.id };
    },
  }),
];

/**
 * Lines starting with role-marker strings, or containing override
 * instructions, are stripped from article snippets before they go back
 * to the model. This is a defense-in-depth measure against an attacker
 * who can post to the knowledge base.
 */
const ROLE_MARKER_RE = /^\s*(system|assistant|tool|user|human|ai)\s*:/im;
const OVERRIDE_PHRASES = [
  "ignore previous instructions",
  "ignore the above",
  "disregard prior",
  "disregard all",
  "forget everything",
  "you are now",
  "new instructions:",
];
const FENCE_LINE = "[snippet line removed: looks like an instruction]";

export function fenceSnippet(input: string): { safe: string; wasBlocked: boolean } {
  if (!input) return { safe: "", wasBlocked: false };
  let wasBlocked = false;
  const lines = input.split(/\r?\n/);
  const safe = lines
    .map((line) => {
      const lower = line.toLowerCase();
      if (ROLE_MARKER_RE.test(line)) { wasBlocked = true; return FENCE_LINE; }
      if (OVERRIDE_PHRASES.some((p) => lower.includes(p))) { wasBlocked = true; return FENCE_LINE; }
      return line;
    })
    .join("\n");
  return { safe, wasBlocked };
}

// ---------- declaration + execution ----------

/** Minimal zod→JSON-Schema for flat object schemas of string/number fields. */
function zodToParameters(schema: z.ZodTypeAny): Record<string, unknown> {
  if (!(schema instanceof z.ZodObject)) return { type: "object", properties: {} };
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, def] of Object.entries(schema.shape)) {
    const inner = def as z.ZodTypeAny;
    if (inner instanceof z.ZodString && !inner.isOptional()) {
      properties[key] = { type: "string" };
      required.push(key);
    } else if (inner instanceof z.ZodNumber && !inner.isOptional()) {
      properties[key] = { type: "number" };
      required.push(key);
    } else {
      properties[key] = { type: "string" };
    }
  }
  return { type: "object", properties, required: required.length ? required : undefined };
}

/** OpenAI-compatible tools array for the chat completions API. */
export function openAITools() {
  return TOOLS.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToParameters(t.parameters),
    },
  }));
}

/** Filter the tool list to the tools the caller is allowed to use. */
export function toolsForContext(ctx: AuthContext, enabledNames: Set<string>): ToolDef[] {
  return TOOLS.filter((t) => enabledNames.has(t.name) && can(ctx.access, t.permission));
}

export interface ToolExecResult {
  ok: boolean;
  /** JSON string for the model */
  payload: string;
  /** fields dropped by the field-allow-list (defense-in-depth telemetry) */
  redactedFields: number;
  /** when the tool is blocked by org policy or permission */
  blocked: boolean;
  blockedReason?: string;
}

export async function executeTool(
  ctx: AuthContext,
  name: string,
  rawArgs: string,
  enabledNames: Set<string>,
): Promise<ToolExecResult> {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) {
    return {
      ok: false,
      payload: JSON.stringify({ error: "Unknown tool" }),
      redactedFields: 0,
      blocked: true,
      blockedReason: "unknown_tool",
    };
  }
  // Org policy: if the org has disabled this tool, refuse to run.
  if (!enabledNames.has(name)) {
    return {
      ok: false,
      payload: JSON.stringify({ error: "This tool is disabled by your organization's policy." }),
      redactedFields: 0,
      blocked: true,
      blockedReason: "org_disabled",
    };
  }
  // Permission: even if declared, only callers with the right key can use it.
  if (!can(ctx.access, t.permission)) {
    return {
      ok: false,
      payload: JSON.stringify({ error: "You don't have permission to use this tool." }),
      redactedFields: 0,
      blocked: true,
      blockedReason: "permission_denied",
    };
  }

  let args: unknown = {};
  if (rawArgs && rawArgs.trim() && t.parameters instanceof z.ZodObject) {
    try {
      args = JSON.parse(rawArgs);
    } catch {
      return {
        ok: false,
        payload: JSON.stringify({ error: "Invalid tool arguments" }),
        redactedFields: 0,
        blocked: true,
        blockedReason: "bad_args",
      };
    }
    const parsed = t.parameters.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        payload: JSON.stringify({ error: "Invalid tool arguments" }),
        redactedFields: 0,
        blocked: true,
        blockedReason: "bad_args",
      };
    }
    args = parsed.data;
  }

  let raw: unknown;
  try {
    raw = await t.execute(ctx, args);
  } catch (e) {
    if (e instanceof ApiError) {
      return {
        ok: false,
        payload: JSON.stringify({ error: e.message }),
        redactedFields: 0,
        blocked: true,
        blockedReason: e.status === 403 ? "permission_denied" : "tool_error",
      };
    }
    return {
      ok: false,
      payload: JSON.stringify({ error: "Tool execution failed" }),
      redactedFields: 0,
      blocked: true,
      blockedReason: "tool_error",
    };
  }

  // Validate output through zod. Drop any fields not in the schema.
  const schema = t.outputSchema as z.ZodTypeAny;
  const parsed = schema.safeParse(raw);
  let pruned: unknown = raw;
  let redactedFields = 0;
  if (parsed.success) {
    pruned = parsed.data;
  } else {
    // Best-effort: parse succeeded structurally but didn't match the
    // expected shape. Drop unknown keys to be safe.
    if (raw && typeof raw === "object" && schema instanceof z.ZodObject) {
      const allowed = Object.keys(schema.shape);
      const before = Object.keys(raw as object).length;
      pruned = pickFields(raw as Record<string, unknown>, allowed);
      redactedFields = before - Object.keys(pruned as object).length;
    }
  }
  return {
    ok: true,
    payload: JSON.stringify(pruned).slice(0, 8000),
    redactedFields,
    blocked: false,
  };
}
