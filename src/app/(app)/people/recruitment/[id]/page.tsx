export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton, SimpleForm } from "@/components/finance-people-actions";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { ApiError } from "@/lib/errors";
import { can } from "@/modules/iam/engine";
import { getCandidate, STAGES } from "@/modules/people-ops/service";

export const metadata = { title: "Candidate" };

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "recruitment.manage")) {
    return <Card><EmptyState title="Recruitment" hint="You don't have recruitment permissions." /></Card>;
  }
  const { id } = await params;
  let data;
  try {
    data = await getCandidate(ctx, id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/people/recruitment" className="text-xs text-tertiary hover:underline">← Back to recruitment</Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-primary">{data.candidate.name}</h1>
          <p className="text-sm text-secondary">{data.candidate.email ?? ""}</p>
        </div>
        <Badge tone={data.candidate.stage === "hired" ? "green" : data.candidate.stage === "rejected" ? "red" : "brand"}>
          {data.candidate.stage}
        </Badge>
      </header>

      <Card>
        <CardHeader title="Move stage" />
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {STAGES.filter((s) => s !== data.candidate.stage).map((s) => (
            <ActionButton key={s} label={s} path="/api/v1/people-ops/candidates"
              body={{ id, stage: s }}
              className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-hover" />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Add note / interview / offer" />
        <SimpleForm
          path={`/api/v1/people-ops/candidates/${id}`}
          submitLabel="Add entry"
          fields={[
            { name: "kind", label: "Kind", type: "select", required: true, options: [
              { value: "note", label: "Note" }, { value: "interview", label: "Interview" }, { value: "offer", label: "Offer" },
            ]},
            { name: "scheduledAt", label: "Scheduled at (ISO, interviews)", placeholder: "2026-09-01T10:00" },
            { name: "summary", label: "Details", type: "textarea", required: true, nest: "payload" },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Activity" />
        {data.events.length === 0 ? <p className="px-5 py-4 text-sm text-tertiary">No activity yet.</p> : (
          <ul className="divide-y divide-border-subtle text-sm">
            {data.events.map((ev) => (
              <li key={ev.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium capitalize">{ev.kind}</span>
                  <span className="text-xs text-tertiary">{new Date(ev.createdAt).toLocaleString()}</span>
                </div>
                {ev.payload != null && typeof ev.payload === "object" ? (
                  <p className="mt-0.5 text-xs text-secondary">{JSON.stringify(ev.payload).slice(0, 300)}</p>
                ) : null}
                {ev.scheduledAt ? <p className="text-xs text-tertiary">Scheduled {new Date(ev.scheduledAt).toLocaleString()}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
