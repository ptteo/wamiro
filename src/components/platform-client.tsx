"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, CardHeader, EmptyState } from "./ui";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  userCount: number;
  createdAt: string;
}

export function PlatformClient({
  tenants,
  selfOrgId,
}: {
  tenants: Tenant[];
  selfOrgId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: string, status: "active" | "suspended") {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/platform/orgs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Action failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader title={`Tenants (${tenants.length})`} />
      {tenants.length === 0 ? (
        <EmptyState title="No tenants registered" />
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {tenants.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[var(--color-ink)]">
                  {t.name}
                  {t.id === selfOrgId && (
                    <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
                      (your organization)
                    </span>
                  )}
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  /{t.slug} · {t.userCount} user{t.userCount === 1 ? "" : "s"} · joined{" "}
                  {new Date(t.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Badge tone={t.status === "active" ? "green" : "red"}>{t.status}</Badge>
              {t.id !== selfOrgId && (
                <button
                  type="button"
                  disabled={busy === t.id}
                  onClick={() => setStatus(t.id, t.status === "active" ? "suspended" : "active")}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                    t.status === "active"
                      ? "border-danger/30 bg-surface text-danger hover:bg-danger-subtle"
                      : "border-success/30 bg-surface text-success hover:bg-success-subtle"
                  }`}
                >
                  {t.status === "active" ? "Suspend" : "Reactivate"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="px-5 pb-4 text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
