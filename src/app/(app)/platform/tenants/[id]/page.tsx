export const dynamic = "force-dynamic";

import { PlatformTenant360 } from "@/components/platform-tenant-360";
import { PlatformShell, PlatformPageHeader } from "@/components/platform-sub-nav";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage, can } from "@/lib/page-auth";
import {
  tenantOverview,
  tenantUsageTab,
  tenantBillingTab,
  tenantSupportTab,
  tenantAccessTab,
} from "@/modules/platform/tenant-360";
import { tenantTimeline } from "@/modules/platform/crm";

export const metadata = { title: "Tenant 360" };

export default async function PlatformTenantPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthPage();
  const { id } = await params;

  if (!can(ctx.access, "platform.admin")) {
    return (
      <Card>
        <EmptyState title="Platform console" hint="Only the Platform Super Admin can access this area." />
      </Card>
    );
  }

  // Overview is authoritative — a bad org id 404s here. Other tabs degrade to
  // null so a partial rollup never blanks the whole page.
  const overview = await tenantOverview(ctx, id);
  const [usage, billing, support, access, timeline] = await Promise.all([
    tenantUsageTab(ctx, id).catch(() => null),
    tenantBillingTab(ctx, id).catch(() => null),
    tenantSupportTab(ctx, id).catch(() => null),
    tenantAccessTab(ctx, id).catch(() => null),
    tenantTimeline(ctx, id, 100).catch(() => []),
  ]);

  return (
    <PlatformShell current="/platform">
      <div className="mx-auto max-w-6xl space-y-4">
        <PlatformPageHeader
          title={overview.name}
          lede={`Tenant 360 — /${overview.slug} · ${overview.planName} · ${overview.billingStatus}`}
        />
        <PlatformTenant360
          overview={overview}
          usage={usage}
          billing={billing}
          support={support}
          access={access}
          timeline={timeline}
        />
      </div>
    </PlatformShell>
  );
}
