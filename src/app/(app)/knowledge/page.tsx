import { KnowledgeClient } from "@/components/knowledge-client";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { isFavorite } from "@/modules/favorites/service";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";
import { get, list } from "@/modules/knowledge/service";

export const dynamic = "force-dynamic";

export const metadata = { title: "Knowledge" };

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const ctx = await requireAuthPage();
  const sp = await searchParams;

  if (!isModuleEnabled(ctx.org.modules, "knowledge") || !can(ctx.access, "knowledge.view")) {
    return (
      <Card>
        <EmptyState title="Knowledge unavailable" hint="You don't have access to the knowledge base." />
      </Card>
    );
  }

  const articles = await list(ctx);
  const selected = sp.id ? articles.find((a) => a.id === sp.id) ?? (await get(ctx, sp.id)) : null;
  const selectedStarred = selected
    ? await isFavorite(ctx.user.id, "article", selected.id)
    : undefined;
  const canManage = can(ctx.access, "knowledge.manage");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Knowledge</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Company handbook, policies and how-tos. Also searchable via ⌘K.
        </p>
      </header>

      <KnowledgeClient
        articles={articles.map((a) => ({
          id: a.id,
          title: a.title,
          excerpt: a.body.slice(0, 120),
          tags: a.tags,
          authorName: a.authorName,
          updatedAt: a.updatedAt.toISOString(),
          // ship the full body only for the open article
          body: a.id === selected?.id ? a.body : undefined,
          starred: a.id === selected?.id ? selectedStarred : undefined,
        }))}
        selectedId={selected?.id ?? null}
        canManage={canManage}
      />
    </div>
  );
}
