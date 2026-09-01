import { PollsListClient, type PollClientRow } from "@/components/polls-list";
import { Content, PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { listActive } from "@/modules/surveys/service";

export const dynamic = "force-dynamic";

export const metadata = { title: "Polls" };

export default async function SurveysPage() {
  const ctx = await requireAuthPage();
  const surveys = await listActive(ctx);
  const canAuthor = can(ctx.access, "announcements.manage");

  const polls: PollClientRow[] = surveys.map((s) => ({
    id: s.id,
    question: s.question,
    options: s.options,
    createdAt: s.createdAt.toISOString(),
    myVote: s.myVote,
    counts: s.counts,
    totalVotes: s.totalVotes,
    canDelete: s.canManage,
  }));

  return (
    <Content width="standard">
      <PageHeader
        title="Polls"
        subtitle="Quick questions for the whole company. Pick an option to see results."
      />
      <PollsListClient polls={polls} canAuthor={canAuthor} />
    </Content>
  );
}
