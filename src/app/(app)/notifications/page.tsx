export const dynamic = "force-dynamic";

import { NotificationsClient } from "@/components/notifications-client";
import { requireAuthPage } from "@/lib/page-auth";
import { listMine } from "@/modules/notifications/service";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await requireAuthPage();
  const sp = await searchParams;
  const items = await listMine(ctx, 100);

  // Optional `?q=` filter — case-insensitive substring across title and
  // body. Useful when the user types in the home command bar.
  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = q
    ? items.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          (n.body ?? "").toLowerCase().includes(q),
      )
    : items;

  return (
    <NotificationsClient
      items={filtered.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        read: n.readAt !== null,
        createdAt: n.createdAt.toISOString(),
      }))}
    />
  );
}
