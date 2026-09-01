import Link from "next/link";

import { AutomationsClient } from "@/components/automations-client";
import { Card } from "@/components/ui";
import { Content, PageHeader } from "@/components/page-header";
import { RequestsListClient, type RequestRow, type RequestTypeClient } from "@/components/requests-list";
import { RequestTypesAdmin } from "@/components/request-types-admin";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listRules } from "@/modules/automations/service";
import {
  listTypes,
  listTypesForAdmin,
  myRequests,
  pendingForApprover,
} from "@/modules/requests/service";
import { db } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import { users, requestTypes as requestTypesTbl } from "@/db/schema";

export const dynamic = "force-dynamic";

export const metadata = { title: "Requests" };

export default async function RequestsPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "requests") || !can(ctx.access, "requests.apply")) {
    return (
      <Content width="standard">
        <Card>
          <div className="px-5 py-10 text-center text-sm text-tertiary">
            Request center unavailable — you don&apos;t have access to submit requests.
          </div>
        </Card>
      </Content>
    );
  }

  const [types, mine, pending] = await Promise.all([
    listTypes(ctx),
    myRequests(ctx),
    pendingForApprover(ctx),
  ]);
  const adminTypes = can(ctx.access, "requests.manage") ? await listTypesForAdmin(ctx) : [];
  const rules = can(ctx.access, "automations.manage") ? await listRules(ctx) : [];
  const hasApprovalsPermission = can(ctx.access, "requests.approve");
  const hasManagePermission = can(ctx.access, "requests.manage");
  const hasAutomationsPermission = can(ctx.access, "automations.manage");

  // Look up reviewer names + workflow step counts for the request rows.
  const reviewerIds = Array.from(
    new Set(
      mine.filter((r) => r.status !== "pending" && r.reviewedBy).map((r) => r.reviewedBy as string),
    ),
  );
  const typeIds = Array.from(new Set(mine.map((r) => r.typeId)));
  const [reviewerRows, typeRows] = await Promise.all([
    reviewerIds.length > 0
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, reviewerIds))
      : Promise.resolve([] as { id: string; name: string }[]),
    typeIds.length > 0
      ? db
          .select({
            id: requestTypesTbl.id,
            steps: requestTypesTbl.steps,
            approverMode: requestTypesTbl.approverMode,
          })
          .from(requestTypesTbl)
          .where(inArray(requestTypesTbl.id, typeIds))
      : Promise.resolve([] as { id: string; steps: unknown; approverMode: string }[]),
  ]);
  const reviewerById = new Map(reviewerRows.map((r) => [r.id, r.name] as const));
  const typeMetaById = new Map(typeRows.map((t) => [t.id, t] as const));

  const requestRows: RequestRow[] = mine.map((r) => {
    const meta = typeMetaById.get(r.typeId);
    const steps = Array.isArray(meta?.steps) ? (meta!.steps as unknown[]) : [];
    const totalSteps = steps.length > 0 ? steps.length : 1;
    return {
      id: r.id,
      typeId: r.typeId,
      typeName: r.typeName,
      payload: r.payload,
      status: r.status as RequestRow["status"],
      reviewNote: r.reviewNote,
      createdAt: r.createdAt.toISOString(),
      slaDueAt: r.slaDueAt ? r.slaDueAt.toISOString() : null,
      escalatedAt: r.escalatedAt ? r.escalatedAt.toISOString() : null,
      currentStep: r.currentStep,
      totalSteps,
      mine: true, // myRequests is already filtered to the viewer's
      reviewerName: r.reviewedBy ? reviewerById.get(r.reviewedBy) ?? null : null,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    };
  });

  const requestTypes: RequestTypeClient[] = types.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    fields: t.fields,
  }));

  return (
    <Content width="wide">
      <PageHeader
        title="Requests"
        subtitle="Submit requests and track their status. Approvers get notified automatically."
      />

      <RequestsListClient
        types={requestTypes}
        mine={requestRows}
        hasApprovalsPermission={hasApprovalsPermission}
      />

      {pending.length > 0 ? (
        <div className="mt-2 rounded-md border border-warning-subtle bg-warning-subtle px-4 py-2 text-xs text-warning">
          <span className="font-medium">{pending.length}</span> request{pending.length === 1 ? "" : "s"} need
          your decision.{" "}
          <Link href="/approvals" className="font-medium underline">
            Open approvals →
          </Link>
        </div>
      ) : null}

      {hasManagePermission ? (
        <details className="group rounded-lg border border-border-subtle bg-surface open:bg-surface-subtle/30">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold text-primary">
            <span>Admin · Request types ({adminTypes.filter((t) => t.active).length} active)</span>
            <span className="text-xs font-normal text-tertiary group-open:hidden">Click to expand</span>
            <span className="hidden text-xs font-normal text-tertiary group-open:inline">Click to collapse</span>
          </summary>
          <div className="border-t border-border-subtle">
            <RequestTypesAdmin
              types={adminTypes.map((t) => ({
                id: t.id,
                key: t.key,
                name: t.name,
                fields: t.fields,
                approverMode: t.approverMode,
                active: t.active,
                steps: t.steps ?? [],
              }))}
            />
          </div>
        </details>
      ) : null}

      {hasAutomationsPermission ? (
        <details className="group rounded-lg border border-border-subtle bg-surface open:bg-surface-subtle/30">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold text-primary">
            <span>Admin · Automations ({rules.filter((r) => r.active).length} active)</span>
            <span className="text-xs font-normal text-tertiary group-open:hidden">Click to expand</span>
            <span className="hidden text-xs font-normal text-tertiary group-open:inline">Click to collapse</span>
          </summary>
          <div className="border-t border-border-subtle">
            <AutomationsClient
              rules={rules.map((r) => ({
                id: r.id,
                name: r.name,
                conditionField: r.conditionField,
                conditionOp: r.conditionOp,
                conditionValue: r.conditionValue,
                notifyEmails: r.notifyEmails,
                active: r.active,
              }))}
            />
          </div>
        </details>
      ) : null}
    </Content>
  );
}
