export const dynamic = "force-dynamic";

import Link from "next/link";

import { ActionButton, SimpleForm } from "@/components/finance-people-actions";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { listJourneys } from "@/modules/people-ops/service";

export const metadata = { title: "Lifecycle" };

export default async function LifecyclePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "lifecycle.manage")) {
    return <Card><EmptyState title="Lifecycle" hint="You don't have HR lifecycle permissions." /></Card>;
  }
  const sp = await searchParams;
  const kind = sp.kind === "offboarding" ? "offboarding" as const : "onboarding" as const;
  const rows = await listJourneys(ctx, kind);
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-primary">
            {kind === "onboarding" ? "Onboarding" : "Offboarding"}
          </h1>
          <p className="mt-1 text-sm text-secondary">Guided journeys with tasks, documents, access and assets.</p>
        </div>
        <Link href={`/people/lifecycle?kind=${kind === "onboarding" ? "offboarding" : "onboarding"}`}
          className="text-xs text-brand-text hover:underline">
          Switch to {kind === "onboarding" ? "offboarding" : "onboarding"}
        </Link>
      </header>

      <Card>
        <CardHeader title={`Start ${kind} journey`} subtitle="Creates a checklist for the employee (or leaver)." />
        <SimpleForm
          path="/api/v1/people-ops/journeys"
          submitLabel="Start journey"
          payload={{ kind }}
          fields={[
            { name: "userId", label: "Employee user id", required: true },
            { name: "dueDate", label: "Due date", type: "date" },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title={`${kind === "onboarding" ? "New joiners" : "Leavers"} (${rows.length})`} />
        {rows.length === 0 ? <p className="px-5 py-4 text-sm text-tertiary">No journeys yet.</p> : (
          <ul className="divide-y divide-border-subtle text-sm">
            {rows.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <Link href={`/people/lifecycle/${j.id}`} className="font-medium hover:underline">{j.userName}</Link>
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums">{j.doneCount}/{j.totalCount} done</span>
                  <Badge tone={j.status === "completed" ? "green" : "amber"}>{j.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
