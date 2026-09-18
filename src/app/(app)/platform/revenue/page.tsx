export const dynamic = "force-dynamic";

import { PlatformRevenueCard } from "@/components/platform-revenue-card";
import { PlatformShell, PlatformPageHeader } from "@/components/platform-sub-nav";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage, can } from "@/lib/page-auth";
import { churnByReason, invoiceAging, mrrWaterfall, renewalForecast, revenueKpis } from "@/modules/platform/revenue";

export const metadata = { title: "Revenue" };

export default async function PlatformRevenuePage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "platform.admin")) {
    return (
      <Card>
        <EmptyState title="Platform console" hint="Only the Platform Super Admin can access this area." />
      </Card>
    );
  }

  const [kpis, waterfall, aging, renewals, churnReasons] = await Promise.all([
    revenueKpis(ctx),
    mrrWaterfall(6).catch(() => []),
    invoiceAging(ctx).catch(() => []),
    renewalForecast(ctx).catch(() => []),
    churnByReason(ctx).catch(() => []),
  ]);

  return (
    <PlatformShell current="/platform/revenue">
      <div className="mx-auto max-w-6xl space-y-4">
        <PlatformPageHeader
          title="Revenue"
          lede="Collected revenue (ledger-authoritative), forward-looking MRR (seats × price snapshots), MRR movement, aging and renewals."
        />
        <PlatformRevenueCard kpis={kpis} waterfall={waterfall} aging={aging} renewals={renewals} churnReasons={churnReasons} />
      </div>
    </PlatformShell>
  );
}
