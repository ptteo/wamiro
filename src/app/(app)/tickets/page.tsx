export const dynamic = "force-dynamic";

import { TicketsClient } from "@/components/tickets-client";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";
import { listTickets } from "@/modules/tickets/service";

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

  const all = await listTickets(ctx);
  const canManage = can(ctx.access, "tickets.manage");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Support</h1>
        <p className="mt-1 text-sm text-secondary">IT issues and service requests.</p>
      </header>

      <TicketsClient
        tickets={all.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          category: t.category,
          requesterName: "requesterName" in t ? String(t.requesterName ?? "") : ctx.user.name,
          createdAt: t.createdAt.toISOString(),
        }))}
        canManage={canManage}
        canCreate
      />
    </div>
  );
}
