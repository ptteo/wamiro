import Link from "next/link";

import { Badge, Card } from "@/components/ui";
import { overallStatus, snapshotHealth } from "@/lib/health";

export const dynamic = "force-dynamic";
export const metadata = { title: "System status" };

function tone(state: string): "green" | "amber" | "red" | "neutral" {
  if (state === "healthy" || state === "operational") return "green";
  if (state === "stale" || state === "degraded" || state === "unknown") return "amber";
  return "red";
}

export default async function StatusPage() {
  const snap = await snapshotHealth();
  const overall = overallStatus(snap);
  const jobs = snap.components.jobs.status;

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-16">
      <p className="text-xs font-medium uppercase tracking-wide text-tertiary">Wamiro</p>
      <h1 className="mt-1 text-2xl font-semibold text-primary">System status</h1>
      <p className="mt-2 text-sm text-secondary">Public view of the same checks as the health endpoint. No tenant data.</p>

      <div className="mt-6 flex items-center gap-2">
        <Badge tone={tone(overall)}>{overall}</Badge>
        <span className="text-xs text-tertiary">v{snap.version}</span>
      </div>

      <Card className="mt-6">
        <ul className="divide-y divide-border-subtle text-sm">
          <li className="flex items-center justify-between px-5 py-3">
            <span className="text-secondary">Database</span>
            <Badge tone={tone(snap.components.database)}>{snap.components.database}</Badge>
          </li>
          <li className="flex items-center justify-between px-5 py-3">
            <span className="text-secondary">Storage</span>
            <Badge tone={tone(snap.components.storage)}>{snap.components.storage}</Badge>
          </li>
          <li className="flex items-center justify-between px-5 py-3">
            <span className="text-secondary">Background jobs</span>
            <Badge tone={tone(jobs)}>{jobs}</Badge>
          </li>
        </ul>
      </Card>

      <p className="mt-8 text-center text-sm text-tertiary">
        <Link href="/login" className="text-brand-text hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
