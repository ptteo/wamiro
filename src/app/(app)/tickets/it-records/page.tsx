export const dynamic = "force-dynamic";

import { ItRecordsClient } from "@/components/it-records-client";
import { Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";
import { listRecords, type ItType } from "@/modules/it-records/service";
import { listTickets } from "@/modules/tickets/service";

export const metadata = { title: "IT records" };

export default async function ItRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const ctx = await requireAuthPage();
  const sp = await searchParams;
  const type = (["incident", "problem", "change"].includes(sp.type ?? "") ? sp.type : "incident") as ItType;
  if (!isModuleEnabled(ctx.org.modules, "tickets") || !can(ctx.access, "tickets.manage")) {
    return (
      <Card>
        <EmptyState title="IT records" hint="Only support agents can manage incidents, problems and changes." />
      </Card>
    );
  }
  const [records, openTickets] = await Promise.all([listRecords(ctx, type), listTickets(ctx)]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="IT records"
        subtitle="Incidents, problems and changes — linked to the tickets they relate to."
      />
      <ItRecordsClient
        initialType={type}
        initialRecords={records.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          impact: r.impact ?? "",
          priority: r.priority,
          status: r.status,
          affectedService: r.affectedService ?? "",
          ownerName: r.ownerName ?? "",
          ticketCount: r.ticketCount.length,
          updatedAt: r.updatedAt.toISOString(),
        }))}
        ticketOptions={openTickets.map((t) => ({ id: t.id, title: t.title }))}
      />
    </div>
  );
}