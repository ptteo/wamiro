export const dynamic = "force-dynamic";

import Link from "next/link";

import { AiChat } from "@/components/ai-chat";
import { Card, CardHeader, EmptyState, btn } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can, type EffectiveAccess } from "@/modules/iam/engine";
import { aiConfig } from "@/modules/ai/chat";
import { getMessages, listConversations } from "@/modules/ai/conversations";

export const metadata = { title: "AI Assistant" };

function suggestionsFor(access: EffectiveAccess): string[] {
  const out: string[] = [];
  // Everyone
  out.push("How much leave do I have left?");
  if (can(access, "announcements.read")) out.push("Summarize recent announcements");
  if (can(access, "knowledge.read")) out.push("What's the company policy on remote work?");
  // Managers
  if (can(access, "leave.approve") || can(access, "requests.approve")) {
    out.push("What's waiting for my approval?");
  }
  if (can(access, "people.view_team") || can(access, "people.view_company")) {
    out.push("Who's out today?");
  }
  // Finance
  if (can(access, "finance.view_company")) {
    out.push("How much is awaiting expense approval?");
  }
  if (can(access, "finance.view_self")) {
    out.push("What did I spend on last month, by category?");
  }
  // Admin
  if (can(access, "analytics.view")) {
    out.push("Give me a one-line workforce summary.");
  }
  if (can(access, "admin.users.manage")) {
    out.push("How many active users do we have?");
  }
  // Workplace
  if (can(access, "workplace.book")) {
    out.push("What's booked in conference rooms today?");
  }
  return Array.from(new Set(out)).slice(0, 5);
}

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const ctx = await requireAuthPage();
  const sp = await searchParams;
  if (!isModuleEnabled(ctx.org.modules, "ai")) {
    return (
      <Card>
        <EmptyState title="AI unavailable" hint="This module is disabled for your organization." />
      </Card>
    );
  }

  const conversations = await listConversations(ctx);
  const activeId = sp.c ?? null;
  const configured = aiConfig() !== null;
  const suggestions = suggestionsFor(ctx.access);

  // restore prior turns so reopening a conversation shows its history
  let initialMessages: { role: "user" | "assistant"; content: string }[] = [];
  if (activeId) {
    try {
      const rows = await getMessages(ctx, activeId);
      initialMessages = rows.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
    } catch {
      initialMessages = [];
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">AI Assistant</h1>
          <p className="mt-1 text-sm text-secondary">
            Answers respect your permissions — the assistant sees only what you can.
          </p>
        </div>
        <Link href="/assistant" className={`${btn.secondary} ${btn.small}`}>+ New conversation</Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit">
          <CardHeader title="History" subtitle={`${conversations.length} conversation${conversations.length === 1 ? "" : "s"}`} />
          {conversations.length === 0 ? (
            <p className="px-5 py-4 text-sm text-tertiary">No conversations yet.</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-border-subtle overflow-y-auto">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/assistant?c=${c.id}`}
                    className={`block px-4 py-2.5 text-sm transition hover:bg-surface-hover ${
                      activeId === c.id ? "bg-surface-subtle font-medium text-primary" : "text-secondary"
                    }`}
                    title={new Date(c.createdAt).toLocaleString()}
                  >
                    <span className="line-clamp-2 block">{c.title || "Untitled conversation"}</span>
                    <span className="mt-0.5 block text-[11px] text-tertiary">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <AiChat
          configured={configured}
          conversationId={activeId ?? undefined}
          initialMessages={initialMessages}
          suggestions={suggestions}
        />
      </div>
    </div>
  );
}
