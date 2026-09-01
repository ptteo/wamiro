export const dynamic = "force-dynamic";

import { SimpleForm } from "@/components/finance-people-actions";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listCandidates, listJobs, STAGES } from "@/modules/people-ops/service";

export const metadata = { title: "Recruitment" };

export default async function RecruitmentPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "recruitment.manage")) {
    return <Card><EmptyState title="Recruitment" hint="You don't have recruitment permissions." /></Card>;
  }
  void isModuleEnabled(ctx.org.modules, "people");
  const [jobs, cands] = await Promise.all([listJobs(ctx), listCandidates(ctx)]);
  const byStage = Object.fromEntries(STAGES.map((s) => [s, cands.filter((c) => c.stage === s).length]));
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-primary">Recruitment</h1>
        <p className="mt-1 text-sm text-secondary">Jobs, candidates and the hiring pipeline.</p>
      </header>

      <Card>
        <CardHeader title="Pipeline" />
        <ul className="flex flex-wrap gap-2 px-5 py-4 text-xs">
          {STAGES.map((s) => (
            <li key={s} className="rounded-full border border-border-default bg-surface-subtle px-3 py-1">
              {s}: <span className="font-semibold tabular-nums">{byStage[s]}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Add job opening" />
        <SimpleForm
          path="/api/v1/people-ops/jobs"
          submitLabel="Create job"
          fields={[
            { name: "title", label: "Job title", required: true },
            { name: "location", label: "Location" },
            { name: "employmentType", label: "Type (full_time / contractor…)" },
            { name: "openings", label: "Openings", type: "number" },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Jobs" />
        {jobs.length === 0 ? <p className="px-5 py-4 text-sm text-tertiary">No jobs yet.</p> : (
          <ul className="divide-y divide-border-subtle text-sm">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div><p className="font-medium">{j.title}</p><p className="text-xs text-tertiary">{j.location ?? "—"} · {j.managerName ?? "—"}</p></div>
                <Badge tone={j.status === "open" ? "green" : "neutral"}>{j.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Add candidate" />
        <SimpleForm path="/api/v1/people-ops/candidates" submitLabel="Add candidate"
          fields={[
            { name: "name", label: "Candidate name", required: true },
            { name: "email", label: "Email" },
            { name: "source", label: "Source (referral, LinkedIn…)" },
          ]} />
      </Card>

      <Card>
        <CardHeader title="Candidates" />
        {cands.length === 0 ? <p className="px-5 py-4 text-sm text-tertiary">No candidates yet.</p> : (
          <ul className="divide-y divide-border-subtle text-sm">
            {cands.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <a href={`/people/recruitment/${c.id}`} className="font-medium hover:underline">{c.name}</a>
                  <p className="text-xs text-tertiary">{c.openingTitle ?? "general"} · owner {c.ownerName ?? "—"}</p>
                </div>
                <Badge tone={c.stage === "hired" ? "green" : c.stage === "rejected" ? "red" : "brand"}>{c.stage}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
