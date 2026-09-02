export const dynamic = "force-dynamic";

import { AssistantListClient, type ConversationSummary } from "@/components/assistant-list";
import { Card, EmptyState } from "@/components/ui";
import { Content } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can, type EffectiveAccess } from "@/modules/iam/engine";
import { aiConfig } from "@/modules/ai/chat";
import { getMessages, listConversations } from "@/modules/ai/conversations";

export const metadata = { title: "AI Assistant" };

function suggestionsFor(access: EffectiveAccess): string[] {
  const out: string[] = [];
  out.push("How much leave do I have left?");
  if (can(access, "announcements.read")) out.push("Summarize recent announcements");
  if (can(access, "knowledge.view")) out.push("What's the company policy on remote work?");
  if (can(access, "leave.approve") || can(access, "requests.approve")) {
    out.push("What's waiting for my approval?");
  }
  if (can(access, "people.view_team") || can(access, "people.view_company")) {
    out.push("Who's out today?");
  }
  if (can(access, "finance.view_company")) {
    out.push("How much is awaiting expense approval?");
  }
  if (can(access, "finance.view_self")) {
    out.push("What did I spend on last month, by category?");
  }
  if (can(access, "analytics.view")) {
    out.push("Give me a one-line workforce summary.");
  }
  if (can(access, "admin.users.manage")) {
    out.push("How many active users do we have?");
  }
  if (can(access, "workplace.book")) {
    out.push("What's booked in conference rooms today?");
  }
  return Array.from(new Set(out)).slice(0, 6);
}

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "ai")) {
    return (
      <Content width="standard">
        <Card>
          <EmptyState
            title="AI unavailable"
            hint="This module is disabled for your organization."
          />
        </Card>
      </Content>
    );
  }

  const sp = await searchParams;
  const activeId = sp.c ?? null;
  const conversationsRaw = await listConversations(ctx);
  const conversations: ConversationSummary[] = conversationsRaw.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
    lastMessagePreview: c.lastMessagePreview,
    messageCount: c.messageCount,
  }));
  const configured = aiConfig() !== null;
  const suggestions = suggestionsFor(ctx.access);

  let initialMessages: import("@/components/assistant-list").AssistantMessage[] = [];
  if (activeId) {
    try {
      const rows = await getMessages(ctx, activeId);
      initialMessages = rows.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: m.createdAt,
      }));
    } catch {
      initialMessages = [];
    }
  }

  return (
    <div data-fill-workspace className="flex min-h-0 min-w-0 flex-1 flex-col">
      <h1 className="sr-only">AI Assistant</h1>
      <AssistantListClient
        configured={configured}
        conversationId={activeId ?? undefined}
        initialMessages={initialMessages}
        suggestions={suggestions}
        conversations={conversations}
      />
    </div>
  );
}
