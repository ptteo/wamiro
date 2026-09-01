export const dynamic = "force-dynamic";

import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listAll } from "@/modules/governance/service";
import { requireAuthPage } from "@/lib/page-auth";
import { Card, EmptyState } from "@/components/ui";
import { GovernanceClient } from "@/components/governance-client";

export const metadata = { title: "Governance" };

export default async function GovernancePage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "governance") || !can(ctx.access, "governance.view")) {
    return <Card><EmptyState title="Governance" hint="You don't have governance access." /></Card>;
  }

  const { policies, risks, controls, obligations } = await listAll(ctx);

  return (
    <GovernanceClient
      policies={policies.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        version: p.version,
        effectiveAt: p.effectiveAt,
        reviewAt: p.reviewAt,
        updatedAt: p.updatedAt.toISOString(),
      }))}
      risks={risks.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        impact: r.impact,
        likelihood: r.likelihood,
        status: r.status,
        mitigation: r.mitigation,
        createdAt: r.createdAt.toISOString(),
      }))}
      controls={controls.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        status: c.status,
        result: c.result,
        lastTestedAt: c.lastTestedAt ? c.lastTestedAt.toISOString() : null,
      }))}
      obligations={obligations.map((o) => ({
        id: o.id,
        title: o.title,
        dueAt: o.dueAt,
        status: o.status,
        notes: o.notes,
        escalatedAt: o.escalatedAt ? o.escalatedAt.toISOString() : null,
      }))}
      canManage={can(ctx.access, "governance.manage")}
    />
  );
}
