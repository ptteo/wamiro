export const dynamic = "force-dynamic";

import { ServicesAdminClient } from "@/components/services-admin-client";
import { Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";
import { listForAdmin } from "@/modules/support-catalog/service";

export const metadata = { title: "Services" };

export default async function AdminServicesPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "tickets") || !can(ctx.access, "services.manage")) {
    return (
      <Card>
        <EmptyState title="Service catalog admin" hint="You need the services.manage permission." />
      </Card>
    );
  }
  const services = await listForAdmin(ctx);
  return (
    <div className="space-y-6">
      <PageHeader title="Service catalog" subtitle="Configure the services employees can request." />
      <ServicesAdminClient
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description ?? "",
          category: s.category,
          icon: s.icon,
          expectedDays: s.expectedDays,
          approvalRequired: s.approvalRequired,
          autoCreateTicket: s.autoCreateTicket,
          active: s.active,
        }))}
      />
    </div>
  );
}