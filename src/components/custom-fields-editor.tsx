"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, CardHeader, EmptyState, btn, input } from "./ui";

interface FieldDef {
  id: string;
  key: string;
  label: string;
  type: string;
}

export function CustomFieldsEditor({
  targetUserId,
  defs,
  values,
  canEdit,
}: {
  targetUserId: string;
  defs: FieldDef[];
  values: Record<string, string | number | null>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      let failed = false;
      for (const def of defs) {
        const raw = f.get(def.key);
        const res = await fetch(`/api/v1/people/${targetUserId}/fields`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: def.key, value: raw === "" ? null : raw }),
        });
        if (!res.ok) {
          const d = (await res.json()) as { error?: { message?: string } };
          setError(d.error?.message ?? "Save failed");
          failed = true;
          break;
        }
      }
      if (!failed) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      {error && (
        <p role="alert" className="px-5 pt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <CardHeader
        title="Custom fields"
        action={
          canEdit && defs.length > 0 ? (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              disabled={busy}
              className={`${btn.secondary} ${btn.small}`}
            >
              {editing ? "Cancel" : "Edit values"}
            </button>
          ) : null
        }
      />
      {error && (
        <p role="alert" className="px-5 pt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {defs.length === 0 ? (
        <EmptyState title="No custom fields defined" hint="Admins can define employee fields under People settings." />
      ) : editing && canEdit ? (
        <form onSubmit={save} className="grid gap-3 px-5 py-4 sm:grid-cols-2">
          {defs.map((d) => (
            <label key={d.id} className="text-sm font-medium">
              {d.label}
              <input
                name={d.key}
                type={d.type === "number" ? "number" : d.type === "date" ? "date" : "text"}
                defaultValue={(values[d.key] as string | number | null) ?? ""}
                className={`${input} mt-1`}
              />
            </label>
          ))}
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className={btn.primary}>
              Save
            </button>
          </div>
        </form>
      ) : (
        <ul className="divide-y divide-[var(--color-line)] text-sm">
          {defs.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-6 py-3">
              <span className="text-[var(--color-muted)]">{d.label}</span>
              <span className="font-medium">{(values[d.key] ?? "—") as string}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
