export const dynamic = "force-dynamic";

import { AnnouncementsListClient, type AnnouncementClientRow } from "@/components/announcements-list";
import { Card, EmptyState } from "@/components/ui";
import { Content, PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { listRecent } from "@/modules/announcements/service";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";

export const metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "announcements")) {
    return (
      <Content width="standard">
        <Card>
          <EmptyState
            title="Announcements unavailable"
            hint="This module is disabled for your organization."
          />
        </Card>
      </Content>
    );
  }
  const items = await listRecent(ctx);
  const canManage = can(ctx.access, "announcements.manage");

  const rows: AnnouncementClientRow[] = items.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    authorName: a.authorName,
    authorAvatar: a.authorAvatar,
    authorId: a.authorId,
    audience: a.audience,
    publishedAt: a.publishedAt.toISOString(),
  }));

  return (
    <Content width="wide">
      <PageHeader
        title="Announcements"
        subtitle="Company-wide updates from HR and admins. Pinned to the top, grouped by recency."
      />
      <AnnouncementsListClient items={rows} canManage={canManage} currentUserId={ctx.user.id} />
    </Content>
  );
}
