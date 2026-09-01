export const dynamic = "force-dynamic";

import Link from "next/link";

import { SimpleForm } from "@/components/finance-people-actions";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { listCycles, myReviewEntries, teamReviewEntries } from "@/modules/people-ops/service";

export const metadata = { title: "Performance" };

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ cycleId?: string }> }) {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "performance.view_self") && !can(ctx.access, "performance.manage")) {
    return <Card><EmptyState title="Performance" hint="No performance access." /></Card>;
  }
  const sp = await searchParams;
  const [cycles, mine] = await Promise.all([listCycles(ctx), myReviewEntries(ctx)]);
  const manage = can(ctx.access, "performance.manage");
  const team = sp.cycleId ? await teamReviewEntries(ctx, sp.cycleId) : [];
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-primary">Performance</h1>
        <p className="mt-1 text-sm text-secondary">Review cycles, self reviews and manager reviews.</p>
      </header>

      {manage ? (
        <Card>
          <CardHeader title="New review cycle" subtitle="Creates one review entry per active employee." />
          <SimpleForm path="/api/v1/people-ops/reviews" submitLabel="Create cycle"
            fields={[
              { name: "name", label: "Cycle name", required: true },
              { name: "periodLabel", label: "Period (e.g. H1 2026)", required: true },
              { name: "selfDueAt", label: "Self-review due", type: "date" },
              { name: "managerDueAt", label: "Manager review due", type: "date" },
            ]} />
      </Card>
      ) : null}

      <Card>
        <CardHeader title="My reviews" />
        {mine.length === 0 ? <p className="px-5 py-4 text-sm text-tertiary">No review entries yet.</p> : (
          <ul className="divide-y divide-border-subtle text-sm">
            {mine.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="font-medium">{m.cycleName} ({m.periodLabel})</p>
                  {m.selfDueAt ? <p className="text-xs text-tertiary">Self review due {new Date(m.selfDueAt).toLocaleDateString()}</p> : null}
                </div>
                <Badge tone={m.status === "finalized" ? "green" : m.status === "pending" ? "amber" : "brand"}>{m.status.replace("_", " ")}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {manage || can(ctx.access, "leave.approve") ? (
        <Card>
          <CardHeader
            title="Team reviews"
            action={manage && cycles.length > 0 ? (
              <form className="flex gap-2 text-xs">
                <select name="cycleId" defaultValue={sp.cycleId ?? ""} className="rounded-lg border border-border-default bg-surface px-2 py-1.5">
                  <option value="">Select cycle…</option>
                  {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="submit" className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 font-medium">Load</button>
              </form>
            ) : null}
          />
          {!sp.cycleId ? (
            <p className="px-5 py-4 text-sm text-tertiary">Select a cycle to load entries.</p>
          ) : (
            <ul className="divide-y divide-border-subtle text-sm">
              {team.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
                  <span>{t.employeeName}</span>
                  <div className="flex items-center gap-2">
                    {t.managerRating ? <span className="tabular-nums">{t.managerRating}/5</span> : null}
                    <Badge tone={t.status === "finalized" ? "green" : "neutral"}>{t.status.replace("_", " ")}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Cycles" />
        {cycles.length === 0 ? <p className="px-5 py-4 text-sm text-tertiary">No cycles yet.</p> : (
          <ul className="divide-y divide-border-subtle text-sm">
            {cycles.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <Link href={`/people/performance?cycleId=${c.id}`} className="hover:underline">
                  {c.name} ({c.periodLabel}) · {c.entries} participants
                </Link>
                <Badge tone={c.status === "active" ? "green" : "neutral"}>{c.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {mine.some((m) => ["pending", "self_done"].includes(m.status)) ? (
        <Card>
          <CardHeader title="Submit my self review" subtitle="Achievements, challenges and goals for your latest open entry." />
          <p className="px-5 py-2 text-xs text-tertiary">
            Entry id is shown on each of your reviews; paste it here to submit.
          </p>
          <SimpleForm
            path="/api/v1/people-ops/reviews/{entryId}"
            method="PATCH"
            submitLabel="Save self review"
            payload={{ action: "self" }}
            fields={[
              { name: "entryId", label: "Entry id", required: true },
              { name: "achievements", label: "Achievements", type: "textarea", required: true },
              { name: "challenges", label: "Challenges", type: "textarea" },
              { name: "goals", label: "Goals / development areas", type: "textarea" },
            ]}
          />
        </Card>
      ) : null}
    </div>
  );
}
