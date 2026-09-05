export const dynamic = "force-dynamic";

import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";
import {
  listOpenForSla,
  slaBucketOf,
  sweepSlaStates,
  type SlaBucket,
} from "@/modules/tickets/service";

export const metadata = { title: "SLA dashboard" };

const BUCKET_TITLE: Record<SlaBucket, string> = {
  breached: "Breached",
  at_risk: "At risk",
  due_soon: "Due soon",
  healthy: "Healthy",
};

const BUCKET_TONE: Record<SlaBucket, "red" | "amber" | "brand" | "green"> = {
  breached: "red",
  at_risk: "amber",
  due_soon: "brand",
  healthy: "green",
};

function fmtRemaining(due: Date | null): string {
  if (!due) return "—";
  const ms = due.getTime() - Date.now();
  if (ms <= 0) return `overdue by ${fmtDur(Math.abs(ms))}`;
  return `${fmtDur(ms)} left`;
}

function fmtDur(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export default async function SlaDashboardPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "tickets") || !can(ctx.access, "tickets.manage")) {
    return (
      <Card>
        <EmptyState title="SLA dashboard" hint="Only support agents can view the SLA dashboard." />
      </Card>
    );
  }

  const [sweep, open] = await Promise.all([sweepSlaStates(ctx), listOpenForSla(ctx)]);

  const buckets: Record<SlaBucket, typeof open> = {
    breached: [],
    at_risk: [],
    due_soon: [],
    healthy: [],
  };
  for (const t of open) buckets[slaBucketOf(t)].push(t);
  const order: SlaBucket[] = ["breached", "at_risk", "due_soon", "healthy"];

  return (
    <div className="space-y-6">
      <PageHeader title="SLA dashboard" subtitle="First-response and resolution deadlines across the queue." />
      {sweep.checked > 0 && (
        <p className="text-xs text-tertiary">
          Sweep: {sweep.checked} open checked · {sweep.updated} state updates · {sweep.warned} new warnings ·{" "}
          {sweep.breached} new breaches notified.
        </p>
      )}

      {open.length === 0 ? (
        <Card>
          <EmptyState title="All caught up" hint="No open tickets with SLA deadlines right now." />
        </Card>
      ) : (
        order.map((bucket) =>
          buckets[bucket].length === 0 ? null : (
            <Card key={bucket}>
              <CardHeader
                title={`${BUCKET_TITLE[bucket]} (${buckets[bucket].length})`}
                action={<Badge tone={BUCKET_TONE[bucket]}>{BUCKET_TITLE[bucket]}</Badge>}
              />
              <ul className="divide-y divide-[var(--color-line)]">
                {buckets[bucket].map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-primary">
                        #{t.id.slice(0, 8)} · {t.title}
                      </p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {t.category} · {t.requesterName}
                        {t.assigneeName ? ` · → ${t.assigneeName}` : " · unassigned"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={t.status === "new" ? "amber" : "brand"}>{t.status}</Badge>
                      <Badge tone={t.priority === "urgent" ? "red" : t.priority === "high" ? "amber" : "neutral"}>
                        {t.priority}
                      </Badge>
                      <span className="text-xs tabular-nums text-tertiary">
                        {fmtRemaining(t.slaDueDate)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ),
        )
      )}
    </div>
  );
}