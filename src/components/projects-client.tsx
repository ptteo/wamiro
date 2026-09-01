"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, CardHeader, EmptyState, btn, input } from "./ui";

export function ProjectsClient({
  projects,
  canCreate,
}: {
  projects: {
    id: string;
    name: string;
    description: string | null;
    openTasks: number;
    memberCount: number;
  }[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {canCreate && (
        <div>
          <button type="button" className={btn.primary} onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "New project"}
          </button>
        </div>
      )}

      {open && (
        <form
          className="grid gap-3 rounded-xl border border-border-subtle bg-surface p-5 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const f = new FormData(e.currentTarget);
            try {
              const res = await fetch("/api/v1/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: f.get("name"), description: f.get("description") || null }),
              });
              if (!res.ok) {
                const d = (await res.json()) as { error?: { message?: string } };
                setError(d.error?.message ?? "Could not create project");
                return;
              }
              setOpen(false);
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="text-sm font-medium">
            Name
            <input name="name" className={`${input} mt-1`} required minLength={2} maxLength={120} />
          </label>
          <label className="text-sm font-medium">
            Description
            <input name="description" className={`${input} mt-1`} maxLength={2000} />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className={btn.primary}>
              Create
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Card>
        <CardHeader title={`Projects (${projects.length})`} />
        {projects.length === 0 ? (
          <EmptyState
            title="No active projects"
            hint={canCreate ? "Create your first project above." : "Projects will appear here."}
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {projects.map((p) => (
              <li key={p.id} className="px-5 py-3.5 text-sm">
                <a
                  href={`/projects/${p.id}`}
                  className="font-medium text-primary hover:text-brand-text hover:underline"
                >
                  {p.name}
                </a>
                {p.description ? (
                  <p className="mt-0.5 line-clamp-1 text-xs text-tertiary">{p.description}</p>
                ) : null}
                <p className="mt-1 text-xs text-tertiary">
                  {p.openTasks} open task{p.openTasks === 1 ? "" : "s"} · {p.memberCount} member
                  {p.memberCount === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
