export const dynamic = "force-dynamic";

import { TicketsClient } from "@/components/tickets-client";
import { Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";
import { listAssignableUsers, listTickets } from "@/modules/tickets/service";

export const metadata = { title: "Support" };

export default async function TicketsPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "tickets") || !can(ctx.access, "tickets.create")) {
    return (
      <Card>
        <EmptyState title="Support unavailable" hint="You don't have access to support tickets." />
      </Card>
    );
  }

  const [{ tickets: all, total: ticketTotal }, assignableUsers] = await Promise.all([
    listTickets(ctx),
    can(ctx.access, "tickets.manage") ? listAssignableUsers(ctx) : Promise.resolve([]),
  ]);
  const canManage = can(ctx.access, "tickets.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        subtitle="IT issues and service requests."
        primaryAction={
          canManage
            ? {
                href: "/tickets/sla",
                label: "SLA dashboard",
              }
            : undefined
        }
      />

      <TicketsClient
        tickets={all.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          category: t.category,
          requesterName: String(t.requesterName ?? ""),
          assigneeName: String(t.assigneeName ?? ""),
          slaDueDate: t.slaDueDate?.toISOString() ?? null,
          slaState: t.slaState,
          createdAt: t.createdAt.toISOString(),
        }))}
        canManage={canManage}
        canCreate
        assignableUsers={assignableUsers.map((u) => ({ id: u.id, name: u.name }))}
        viewerId={ctx.user.id}
        totalTickets={ticketTotal}
      />
    </div>
  );
}