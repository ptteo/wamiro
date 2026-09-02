/**
 * Phase D7: dense, Frappe-style analytics components.
 * Divided sections + aligned KPI strip instead of card grids.
 * No gradients, no oversized rounded containers.
 */

export function KpiStrip({
  metrics,
}: {
  metrics: { label: string; value: string | number; comparison?: string; comparisonTone?: "neutral" | "positive" | "negative" }[];
}) {
  return (
    <div className="grid grid-cols-2 divide-x divide-border-subtle border-y border-border-subtle lg:grid-cols-4">
      {metrics.map((m) => (
        <div key={m.label} className="px-5 py-4">
          <p className="text-xs text-tertiary">{m.label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-primary">{m.value}</p>
          {m.comparison && (
            <p
              className={[
                "mt-0.5 text-[11px] tabular-nums",
                m.comparisonTone === "positive" && "text-success",
                m.comparisonTone === "negative" && "text-danger",
                (!m.comparisonTone || m.comparisonTone === "neutral") && "text-tertiary",
              ].filter(Boolean).join(" ")}
            >
              {m.comparison}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function BarChart({
  title,
  points,
}: {
  title: string;
  points: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-[15px] font-semibold text-primary">{title}</h2>
      <div className="space-y-2">
        {points.length === 0 ? (
          <p className="py-4 text-sm text-tertiary">No data for this period.</p>
        ) : (
          points.map((p) => (
            <div key={p.label} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-right text-xs tabular-nums text-tertiary">
                {p.label}
              </span>
              <div className="relative h-5 grow rounded-sm bg-surface-subtle">
                <div
                  className="absolute inset-y-0 left-0 rounded-sm bg-brand"
                  style={{ width: `${Math.max(0, Math.min(100, Math.round((p.value / max) * 100)))}%` }}
                  role="img"
                  aria-label={`${p.label}: ${p.value}`}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-secondary">
                {p.value}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="text-[15px] font-semibold text-primary">{title}</h2>
  );
}
