export const dynamic = "force-dynamic";

import { SimpleForm } from "@/components/finance-people-actions";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import {
  lifecycleTimeline,
  listProfileChanges,
  myEnrollments,
} from "@/modules/people-ops/service";

export const metadata = { title: "My profile" };

export default async function MePage() {
  const ctx = await requireAuthPage();
  const [changes, timeline, learning] = await Promise.all([
    listProfileChanges(ctx),
    lifecycleTimeline(ctx, ctx.user.id).catch(() => ({ jobTitle: null, events: [] })),
    myEnrollments(ctx).catch(() => []),
  ]);
  const hrView = can(ctx.access, "hr.change_manage");
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-primary">{ctx.user.name}</h1>
        <p className="mt-1 text-sm text-secondary">{timeline.jobTitle ?? ctx.user.email}</p>
      </header>

      <Card>
        <CardHeader title="Request a profile change" subtitle="HR reviews and applies approved changes (§8)." />
        <SimpleForm path="/api/v1/people-ops/hr-changes" submitLabel="Submit request"
          fields={[
            { name: "fieldKey", label: "Field", type: "select", required: true, options: [
              { value: "phone", label: "Phone" }, { value: "emergency_contact", label: "Emergency contact" },
              { value: "address", label: "Address" }, { value: "skills", label: "Skills" },
            ]},
            { name: "requestedValue", label: "Requested value", required: true },
          ]}
          payload={{ type: "profile" }}
        />
      </Card>

      <Card>
        <CardHeader title={hrView ? "All profile change requests" : "My change requests"} />
        {changes.length === 0 ? <p className="px-5 py-4 text-sm text-tertiary">No requests.</p> : (
          <ul className="divide-y divide-border-subtle text-sm">
            {changes.slice(0, 20).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="font-medium">{hrView ? `${c.userName} · ` : ""}{c.fieldKey.replace("_", " ")}</p>
                  <p className="text-xs text-tertiary">{c.requestedValue?.slice(0, 80)}</p>
                </div>
                <Badge tone={c.status === "approved" ? "green" : c.status === "rejected" ? "red" : "amber"}>{c.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="My lifecycle timeline" />
        {timeline.events.length === 0 ? <p className="px-5 py-4 text-sm text-tertiary">No events yet.</p> : (
          <ul className="divide-y divide-border-subtle text-sm">
            {timeline.events.map((ev, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span>{ev.label}{ev.detail ? <span className="text-xs text-tertiary"> · {String(ev.detail).slice(0, 60)}</span> : null}</span>
                <span className="text-xs text-tertiary">{ev.at ? new Date(ev.at).toLocaleDateString() : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="My learning snapshot" />
        {learning.length === 0 ? <p className="px-5 py-4 text-sm text-tertiary">Nothing assigned.</p> : (
          <ul className="divide-y divide-border-subtle text-sm">
            {learning.slice(0, 10).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span>{m.courseTitle}</span>
                <Badge tone={m.status === "completed" ? "green" : "neutral"}>{m.status.replace("_", " ")}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
