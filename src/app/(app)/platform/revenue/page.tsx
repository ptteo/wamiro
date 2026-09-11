export const dynamic = "force-dynamic";

import { PlatformRevenueCard } from "@/components/platform-revenue-card";
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
    <div className="space-y-4" data-fill-workspace>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">Revenue</h1>
        <p className="mt-1 text-sm text-secondary">
          Collected revenue (ledger-authoritative), forward-looking MRR (seats × price snapshots), MRR movement, aging and renewals.
        </p>
      </header>
      <PlatformRevenueCard kpis={kpis} waterfall={waterfall} aging={aging} renewals={renewals} churnReasons={churnReasons} />
    </div>
  );
}
