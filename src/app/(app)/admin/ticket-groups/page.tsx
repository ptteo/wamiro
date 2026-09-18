export const dynamic = "force-dynamic";

import { TicketGroupsAdminClient } from "@/components/ticket-groups-admin-client";
import { AdminNav } from "@/components/admin-ui";
import { Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { adminTabsFor } from "@/lib/admin-nav";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";
import { listGroups, listRules } from "@/modules/ticket-groups/service";
import { listAssignableUsers } from "@/modules/tickets/service";

export const metadata = { title: "Ticket groups" };

export default async function TicketGroupsAdminPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "tickets") || !can(ctx.access, "tickets.manage")) {
    return (
      <Card>
        <EmptyState title="Ticket groups" hint="Only support agents can configure routing." />
      </Card>
    );
  }
  const [groups, rules, users] = await Promise.all([listGroups(ctx), listRules(ctx), listAssignableUsers(ctx)]);
  const tabs = adminTabsFor(
    (p) => can(ctx.access, p),
    ctx.org.modules
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Ticket groups"
        subtitle="Route tickets to teams and auto-assign new tickets to the least-loaded member."
      />
      <AdminNav items={tabs} />
      <TicketGroupsAdminClient
        groups={groups.map((g) => ({ id: g.id, name: g.name, description: g.description ?? "", memberCount: g.memberCount }))}
        rules={rules.map((r) => ({
          id: r.id,
          name: r.name,
          groupId: r.groupId,
          groupName: r.groupName ?? "",
          category: r.category ?? "",
          active: r.active,
        }))}
        users={users.map((u) => ({ id: u.id, name: u.name }))}
      />
    </div>
  );
}