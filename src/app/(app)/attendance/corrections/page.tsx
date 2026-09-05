import { Content, PageHeader } from "@/components/page-header";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { listCorrections, pendingCorrections } from "@/modules/attendance/corrections";
import { can, widestScope } from "@/modules/iam/engine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attendance corrections" };

export default async function CorrectionsPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "attendance.view_self")) {
    return (
      <Content>
        <Card>
          <EmptyState title="Unavailable" hint="You don't have access to the attendance module." />
        </Card>
      </Content>
    );
  }

  const approverScope = widestScope(ctx.access, "attendance.correct");
  const [all, pending] = await Promise.all([
    listCorrections(ctx),
    approverScope ? pendingCorrections(ctx) : Promise.resolve([]),
  ]);

  const serialize = (rows: Awaited<ReturnType<typeof listCorrections>>) =>
    rows.map((r) => ({
      id: r.id,
      userName: r.userName,
      recordDate: String(r.recordDate),
      type: r.type,
      requestedInAt: r.requestedInAt ? r.requestedInAt.toISOString() : null,
      requestedOutAt: r.requestedOutAt ? r.requestedOutAt.toISOString() : null,
      reason: r.reason,
      status: r.status,
      decidedNote: r.decidedNote,
      createdAt: r.createdAt.toISOString(),
    }));

  const { CorrectionsClient } = await import("@/components/corrections-client");

  return (
    <Content width="wide">
      <PageHeader
        title="Attendance corrections"
        subtitle="Fix a missed clock-in or wrong time — your manager approves the change."
      />
      <CorrectionsClient
        data={{
          canApprove: approverScope !== undefined,
          corrections: serialize(all),
          pending: serialize(pending),
        }}
      />
    </Content>
  );
}
