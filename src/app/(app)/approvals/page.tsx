export const dynamic = "force-dynamic";

import { ApprovalsCenter } from "@/components/approvals-center";
import type { DecisionItem, PendingItem } from "@/components/approvals-center";
import { DelegationsCard } from "@/components/delegations-card";
import { Card } from "@/components/ui";
import { Content, PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { listMyDelegations } from "@/modules/approvals/delegation";
import {
  listReviewedByMe as reviewedLeave,
  pendingForApprover as pendingLeave,
} from "@/modules/leave/service";
import {
  listReviewedByMe as reviewedRequests,
  pendingForApprover as pendingRequests,
} from "@/modules/requests/service";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "leave.approve") && !can(ctx.access, "requests.approve")) {
    return (
      <Content width="standard">
        <Card>
          <div className="px-5 py-10 text-center text-sm text-tertiary">
            Approval center — you don&apos;t have approval permissions.
          </div>
        </Card>
      </Content>
    );
  }

  const canLeave = can(ctx.access, "leave.approve");
  const canRequest = can(ctx.access, "requests.approve");

  const [pendingLeaves, pendingReqs, reviewedLeaves, reviewedReqs, myDelegations] = await Promise.all([
    canLeave ? pendingLeave(ctx) : Promise.resolve([]),
    canRequest ? pendingRequests(ctx) : Promise.resolve([]),
    canLeave ? reviewedLeave(ctx) : Promise.resolve([]),
    canRequest ? reviewedRequests(ctx) : Promise.resolve([]),
    canRequest ? listMyDelegations(ctx) : Promise.resolve([]),
  ]);

  // ── Pending items ──
  const pending: PendingItem[] = [
    ...pendingLeaves.map((a) => {
      const title = `${a.userName} — ${a.typeName}`;
      const subtitle = [
        `${a.startDate} → ${a.endDate}`,
        `${a.days} day${Number(a.days) === 1 ? "" : "s"}`,
        a.jobTitle,
        a.departmentName,
        a.reason ?? null,
      ]
        .filter((x): x is string => !!x)
        .join(" · ");
      return {
        kind: "leave" as const,
        id: a.id,
        title,
        subtitle,
        requesterName: a.userName,
        requesterAvatar: a.userAvatar ?? null,
        slaDueAt: null, // leave SLA is implicit — fall back to age
        submittedAt: a.createdAt.toISOString(),
        haystack: `${title} ${subtitle} ${a.userName} ${a.jobTitle ?? ""} ${a.departmentName ?? ""}`.toLowerCase(),
      };
    }),
    ...pendingReqs.map((r) => {
      const steps = Array.isArray(r.steps) ? (r.steps as { label: string; approverMode: string }[]) : [];
      const totalSteps = steps.length > 0 ? steps.length : 1;
      const subtitle = Object.entries(r.payload)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `${humanizeKey(k)}: ${v}`)
        .join(" · ");
      const title = `${r.requesterName} — ${r.typeName}`;
      return {
        kind: "request" as const,
        id: r.id,
        title,
        subtitle,
        requesterName: r.requesterName,
        requesterAvatar: r.requesterAvatar ?? null,
        slaDueAt: r.slaDueAt ? r.slaDueAt.toISOString() : null,
        submittedAt: r.createdAt.toISOString(),
        currentStep: r.currentStep,
        totalSteps,
        haystack: `${title} ${subtitle} ${r.requesterName}`.toLowerCase(),
      };
    }),
  ];

  // ── Decision history ──
  const decisions: DecisionItem[] = [
    ...reviewedLeaves
      .filter((l) => l.status === "approved" || l.status === "rejected")
      .map((l): DecisionItem => {
        const title = `${l.userName} — ${l.typeName} (${l.days}d)`;
        return {
          kind: "leave" as const,
          id: l.id,
          title,
          requesterName: l.userName,
          requesterAvatar: l.userAvatar ?? null,
          status: l.status as "approved" | "rejected",
          decidedAt: l.reviewedAt ? l.reviewedAt.toISOString() : new Date().toISOString(),
          note: l.reviewNote,
          haystack: `${title} ${l.userName} ${l.reviewNote ?? ""}`.toLowerCase(),
        };
      }),
    ...reviewedReqs
      .filter((r) => r.status === "approved" || r.status === "rejected")
      .map((r): DecisionItem => {
        const title = `${r.userName} — ${r.typeName}`;
        return {
          kind: "request" as const,
          id: r.id,
          title,
          requesterName: r.userName,
          requesterAvatar: r.userAvatar ?? null,
          status: r.status as "approved" | "rejected",
          decidedAt: r.reviewedAt ? r.reviewedAt.toISOString() : new Date().toISOString(),
          note: r.reviewNote,
          haystack: `${title} ${r.userName} ${r.reviewNote ?? ""}`.toLowerCase(),
        };
      }),
  ];

  return (
    <Content width="wide">
      <PageHeader
        title="Approval Center"
        subtitle="Every decision that needs your action, in one place. Bulk-approve the easy ones; dig into the rest."
      />

      <ApprovalsCenter pending={pending} decisions={decisions} />

      {canRequest ? (
        <DelegationsCard
          initial={myDelegations.map((d) => ({
            id: d.id,
            delegateName: d.delegateName,
            reason: d.reason ?? "",
            expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
            active: d.active,
          }))}
        />
      ) : null}
    </Content>
  );
}

function humanizeKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
