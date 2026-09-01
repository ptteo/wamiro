export const dynamic = "force-dynamic";

import { DiscussionsListClient, type DiscussionSummary } from "@/components/discussions-list";
import { Card, EmptyState } from "@/components/ui";
import { Content, PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listDiscussions } from "@/modules/discussions/service";

export const metadata = { title: "Discussions" };

export default async function DiscussionsPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "announcements")) {
    return (
      <Content width="standard">
        <Card>
          <EmptyState
            title="Discussions unavailable"
            hint="This module is disabled for your organization."
          />
        </Card>
      </Content>
    );
  }
  const all = await listDiscussions(ctx);

  const rows: DiscussionSummary[] = all.map((d) => ({
    id: d.id,
    title: d.title,
    body: d.body,
    authorName: d.authorName,
    authorAvatar: d.authorAvatar,
    scope: d.scope,
    pinned: d.pinned,
    createdAt: d.createdAt.toISOString(),
    replyCount: d.replyCount,
    lastReplyAt: d.lastReplyAt ? new Date(d.lastReplyAt as unknown as string).toISOString() : null,
    mine: d.createdBy === ctx.user.id,
  }));

  return (
    <Content width="wide">
      <PageHeader
        title="Discussions"
        subtitle="Team conversations and company topics. Pinned threads stay at the top."
      />
      <DiscussionsListClient discussions={rows} currentUserId={ctx.user.id} />
    </Content>
  );
}
