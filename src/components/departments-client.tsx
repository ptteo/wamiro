"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminSection } from "./admin-ui";
import { btn, input } from "./ui";

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
    <AdminSection
      title={`Departments (${departments.length})`}
      action={
        canManage ? (
          <button type="button" className={`${btn.secondary} ${btn.small} w-full sm:w-auto`} onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "Add department"}
          </button>
        ) : null
      }
    >
      {open ? (
        <form
          className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end"
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
          <label className="min-w-0 grow text-sm font-medium">
            Name
            <input name="name" className={`${input} mt-1`} required minLength={2} maxLength={80} placeholder="Engineering" />
          </label>
          <button type="submit" className={`${btn.primary} w-full sm:w-auto`} disabled={busy}>
            Create
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="mb-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {departments.length === 0 ? (
        <p className="py-6 text-center text-sm text-tertiary">
          No departments yet{canManage ? " — add your first one above." : "."}
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {departments.map((d) => (
            <li key={d.id} className="flex flex-col gap-0.5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="font-medium">{d.name}</span>
              <span className="text-xs text-tertiary">
                {d.managerName ? `Lead: ${d.managerName} · ` : ""}
                {d.memberCount} member{d.memberCount === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AdminSection>
  );
}
