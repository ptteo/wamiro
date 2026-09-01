import { AcknowledgementsListClient, type AcknowledgementRow, type CompletionStat } from "@/components/acknowledgements-list";
import { PublishAcknowledgementForm } from "@/components/publish-acknowledgement-form";
import { Content, PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { completionStats, listForUser } from "@/modules/acknowledgements/service";

export const metadata = { title: "Acknowledgements" };
export const dynamic = "force-dynamic";

export default async function AcknowledgementsPage() {
  const ctx = await requireAuthPage();
  const canPublish = can(ctx.access, "announcements.manage");
  const [mine, stats] = await Promise.all([
    listForUser(ctx),
    canPublish ? completionStats(ctx) : Promise.resolve([]),
  ]);

  const rows: AcknowledgementRow[] = mine.map((m) => ({
    id: m.id,
    title: m.title,
    body: m.body,
    authorName: m.authorName,
    authorAvatar: m.authorAvatar,
    createdAt: m.createdAt.toISOString(),
    signedAt: m.signedAt ? m.signedAt.toISOString() : null,
    mySignature: m.mySignature,
  }));

  const completionStatsArr: CompletionStat[] = stats.map((s) => ({
    id: s.id,
    title: s.title,
    signed: Number(s.signed),
    total: Number(s.total),
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <Content width="wide">
      <PageHeader
        title="Acknowledgements"
        subtitle="Policies that require your signed confirmation. Signatures are timestamped and logged."
      />
      <AcknowledgementsListClient
        items={rows}
        stats={completionStatsArr}
        canPublish={canPublish}
        viewerName={ctx.user.name}
      />
      {canPublish ? (
        <details className="group rounded-lg border border-border-subtle bg-surface">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold text-primary">
            <span>Admin · Publish a new acknowledgement</span>
            <span className="text-xs font-normal text-tertiary group-open:hidden">Click to expand</span>
            <span className="hidden text-xs font-normal text-tertiary group-open:inline">Click to collapse</span>
          </summary>
          <div className="border-t border-border-subtle">
            <PublishAcknowledgementForm />
          </div>
        </details>
      ) : null}
    </Content>
  );
}
