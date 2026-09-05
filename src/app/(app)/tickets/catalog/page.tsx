export const dynamic = "force-dynamic";

import { CatalogClient } from "@/components/catalog-client";
import { Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";
import { listCatalog } from "@/modules/support-catalog/service";

export const metadata = { title: "Service catalog" };

export default async function CatalogPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "tickets") || !can(ctx.access, "tickets.create")) {
    return (
      <Card>
        <EmptyState title="Service catalog" hint="You don't have access to request services." />
      </Card>
    );
  }
  const services = await listCatalog(ctx);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Service catalog"
        subtitle="Request access, hardware, software and more — approvals and IT execution happen here."
      />
      {services.length === 0 ? (
        <Card>
          <EmptyState title="No services yet" hint="Ask an administrator to publish services." />
        </Card>
      ) : (
        <CatalogClient
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description ?? "",
            category: s.category,
            icon: s.icon,
            expectedDays: s.expectedDays,
            approvalRequired: s.approvalRequired,
          }))}
        />
      )}
    </div>
  );
}