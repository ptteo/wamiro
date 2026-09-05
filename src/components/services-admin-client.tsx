"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, CardHeader, EmptyState, btn, input } from "./ui";

interface ServiceRow {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string | null;
  expectedDays: number | null;
  approvalRequired: boolean;
  autoCreateTicket: boolean;
  active: boolean;
}

const CATEGORIES = ["access", "hardware", "software", "accounts", "security", "facilities", "travel", "other"];

const EMPTY_FORM = {
  name: "",
  description: "",
  category: "access",
  icon: "",
  expectedDays: "",
  approvalRequired: true,
  autoCreateTicket: false,
};

export function ServicesAdminClient({ services }: { services: ServiceRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ServiceRow | "new" | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startNew() {
    setForm(EMPTY_FORM);
    setError(null);
    setEditing("new");
  }
  function startEdit(s: ServiceRow) {
    setForm({
      name: s.name,
      description: s.description,
      category: s.category,
      icon: s.icon ?? "",
      expectedDays: s.expectedDays == null ? "" : String(s.expectedDays),
      approvalRequired: s.approvalRequired,
      autoCreateTicket: s.autoCreateTicket,
    });
    setError(null);
    setEditing(s);
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    const payload = {
      name: String(form.name),
      description: String(form.description),
      category: String(form.category),
      icon: String(form.icon),
      expectedDays: form.expectedDays === "" ? null : Number(form.expectedDays),
      approvalRequired: !!form.approvalRequired,
      autoCreateTicket: !!form.autoCreateTicket,
    };
    try {
      const url = editing === "new" ? "/api/v1/admin/services" : `/api/v1/admin/services/${editing.id}`;
      const res = await fetch(url, {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Save failed");
        return;
      }
      setEditing(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(s: ServiceRow) {
    await fetch(`/api/v1/admin/services/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    router.refresh();
  }

  if (editing) {
    return (
      <Card>
        <CardHeader title={editing === "new" ? "New service" : `Edit: ${editing.name}`} />
        <form onSubmit={save} className="space-y-3 px-5 py-4">
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <label className="block text-sm font-medium">
            Name
            <input required className={`${input} mt-1`} value={String(form.name)} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">
            Description
            <textarea className={`${input} mt-1 min-h-20`} value={String(form.description)} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium">
              Category
              <select className={`${input} mt-1`} value={String(form.category)} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Expected days
              <input type="number" min={0} max={365} className={`${input} mt-1`} value={String(form.expectedDays)} onChange={(e) => setForm({ ...form, expectedDays: e.target.value })} />
            </label>
            <label className="text-sm font-medium">
              Icon
              <input className={`${input} mt-1`} value={String(form.icon)} placeholder="key / laptop / …" onChange={(e) => setForm({ ...form, icon: e.target.value })} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.approvalRequired} onChange={(e) => setForm({ ...form, approvalRequired: e.target.checked })} />
            Requires approval before execution
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.autoCreateTicket} onChange={(e) => setForm({ ...form, autoCreateTicket: e.target.checked })} />
            Auto-create an IT ticket once approved
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={btn.primary}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className={btn.secondary} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={`Services (${services.length})`}
        action={
          <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={startNew}>
            New service
          </button>
        }
      />
      {services.length === 0 ? (
        <EmptyState title="No services" hint="Add the first service employees can request." />
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {services.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-primary">{s.name}</p>
                <p className="truncate text-xs text-[var(--color-muted)]">
                  {s.description || "—"}
                  {s.expectedDays != null ? ` · ~${s.expectedDays}d` : ""}
                  {s.autoCreateTicket ? " · auto-ticket" : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone="neutral">{s.category}</Badge>
                {!s.active && <Badge tone="amber">inactive</Badge>}
                <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => startEdit(s)}>Edit</button>
                <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => void toggleActive(s)}>
                  {s.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}