import { Badge } from "@/components/ui";

export function PlatformJobsCard({
  jobs,
}: {
  jobs: {
    job: string;
    ok: boolean;
    everRan: boolean;
    startedAt: string;
    finishedAt: string | null;
    everyMs: number;
    stale: boolean;
    failures: string[];
    detail: Record<string, unknown> | null;
  }[];
}) {
  return (
    <div className="rounded-lg border border-border-default bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="border-b border-border-subtle px-5 py-3">
        <h2 className="text-sm font-semibold text-primary">Background jobs</h2>
        <p className="mt-0.5 text-xs text-tertiary">Last run per job from the worker ledger. Stale means older than 2× its interval or last run failed.</p>
      </div>
      {jobs.length === 0 ? (
        <p className="px-5 py-4 text-sm text-tertiary">No ledger rows yet. Enable wamiro-jobs.service.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {jobs.map((j) => (
            <li key={j.job} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm text-primary">{j.job}</span>
                <div className="flex items-center gap-2">
                  {!j.everRan ? (
                    <Badge tone="neutral">never run</Badge>
                  ) : (
                    <>
                      {j.stale ? <Badge tone="amber">stale</Badge> : <Badge tone="green">fresh</Badge>}
                      <Badge tone={j.ok ? "green" : "red"}>{j.ok ? "ok" : "failed"}</Badge>
                    </>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-tertiary">
                {j.startedAt
                  ? `Last start ${new Date(j.startedAt).toLocaleString()}`
                  : "Never run"}
                {j.finishedAt ? ` · finished ${new Date(j.finishedAt).toLocaleString()}` : ""}
                {` · every ${Math.round(j.everyMs / 60_000)}m`}
              </p>
              {j.failures.length > 0 ? (
                <ul className="mt-2 space-y-0.5 text-xs text-danger">
                  {j.failures.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              ) : j.detail && j.ok ? (
                <p className="mt-1 text-xs text-tertiary">{summarize(j.detail)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function summarize(detail: Record<string, unknown>): string {
  const skip = new Set(["failures", "error"]);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(detail)) {
    if (skip.has(k) || v == null || typeof v === "object") continue;
    parts.push(`${k} ${v}`);
  }
  return parts.slice(0, 6).join(" · ");
}
