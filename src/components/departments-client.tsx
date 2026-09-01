"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, CardHeader, btn, input } from "./ui";

interface Dept {
  id: string;
  name: string;
  managerName: string | null;
  memberCount: number;
}

export function DepartmentsClient({
  departments,
  canManage,
}: {
  departments: Dept[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader
        title={`Departments (${departments.length})`}
        action={
          canManage ? (
            <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => setOpen((v) => !v)}>
              {open ? "Cancel" : "Add department"}
            </button>
          ) : null
        }
      />
      {open && (
        <form
          className="flex flex-wrap items-end gap-3 border-b border-[var(--color-line)] px-5 py-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const f = new FormData(e.currentTarget);
            try {
              const res = await fetch("/api/v1/departments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: f.get("name") }),
              });
              if (!res.ok) {
                const d = (await res.json()) as { error?: { message?: string } };
                setError(d.error?.message ?? "Could not create department");
                return;
              }
              setOpen(false);
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="grow text-sm font-medium">
            Name
            <input name="name" className={`${input} mt-1`} required minLength={2} maxLength={80} placeholder="Engineering" />
          </label>
          <button type="submit" className={btn.primary} disabled={busy}>
            Create
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="px-5 pt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {departments.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-[var(--color-muted)]">
          No departments yet{canManage ? " — add your first one above." : "."}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {departments.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <span className="font-medium">{d.name}</span>
              <span className="text-xs text-[var(--color-muted)]">
                {d.managerName ? `Lead: ${d.managerName} · ` : ""}
                {d.memberCount} member{d.memberCount === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
