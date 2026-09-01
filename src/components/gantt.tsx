import { Card, CardHeader, EmptyState } from "./ui";

export interface GanttTask {
  id: string;
  title: string;
  status: string;
  assigneeName: string;
  /** ISO date the bar starts (created date) */
  start: string;
  /** ISO date the bar ends (due date); null → bar ends at chart end */
  end: string | null;
}

const DAY = 86_400_000;

/**
 * Gantt-lite timeline — server-rendered CSS, no chart library.
 * Bars run from task creation to its due date (or chart end when undated).
 * ponytail: swap for a proper Gantt library if drag-to-reschedule is needed.
 */
export function GanttChart({ tasks }: { tasks: GanttTask[] }) {
  const dated = tasks.filter((t) => t.end);
  if (dated.length === 0) {
    return (
      <Card>
        <CardHeader title="Timeline" />
        <EmptyState
          title="No scheduled tasks yet"
          hint="Tasks with due dates appear here as timeline bars."
        />
      </Card>
    );
  }

  const times = dated.flatMap((t) => [+new Date(`${t.start}T00:00:00Z`), +new Date(`${t.end!}T00:00:00Z`)]);
  const min = Math.min(...times);
  const max = Math.max(...times) + DAY;
  const span = Math.max(1, max - min);

  return (
    <Card>
      <CardHeader title={`Timeline (${dated.length})`} />
      <div className="px-5 py-4">
        {/* month scale */}
        <div className="mb-2 flex justify-between text-[10px] font-medium text-[var(--color-muted)]">
          <span>{new Date(min).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          <span>{new Date(max).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        </div>
        <div className="space-y-1.5">
          {dated.map((t) => {
            const s = +new Date(`${t.start}T00:00:00Z`);
            const e = +new Date(`${t.end!}T00:00:00Z`);
            const left = ((s - min) / span) * 100;
            const width = Math.max(2, ((e - s) / span) * 100);
            const color =
              t.status === "done"
                ? "bg-success"
                : t.status === "in_progress"
                  ? "bg-[var(--color-brand-500)]"
                  : "bg-border-strong";
            return (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <span className="w-40 shrink-0 truncate text-[var(--color-muted)]" title={t.title}>
                  {t.title}
                </span>
                <div className="relative h-4 grow rounded bg-surface-subtle">
                  <div
                    className={`absolute top-0.5 h-3 rounded ${color}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    role="img"
                    aria-label={`${t.title}: ${t.assigneeName}, ${new Date(s).toLocaleDateString()} to ${new Date(e).toLocaleDateString()}`}
                  />
                </div>
                <span
                  className={`w-24 shrink-0 truncate text-right ${
                    t.status === "done" ? "text-success" : "text-[var(--color-muted)]"
                  }`}
                >
                  {t.assigneeName}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] text-[var(--color-muted)]">
          Bars run from creation to due date. Tasks without due dates are not shown.
        </p>
      </div>
    </Card>
  );
}
