"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { RequestTypeField } from "@/db/schema";
import { Badge, Card, CardHeader, btn, input } from "./ui";

interface AdminType {
  id: string;
  key: string;
  name: string;
  fields: RequestTypeField[];
  approverMode: string;
  active: boolean;
  steps: { label: string; approverMode: string }[];
}

interface DraftField {
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select";
  required: boolean;
  options: string; // comma-separated in the UI
}

interface DraftStep {
  label: string;
  mode: "manager" | "company";
}

const EMPTY: DraftField = { label: "", type: "text", required: false, options: "" };

/** Convert stored field defs back into editable drafts. */
function toDrafts(fields: RequestTypeField[]): DraftField[] {
  return fields.map((f) => ({
    label: f.label,
    type: f.type,
    required: !!f.required,
    options: (f.options ?? []).join(", "),
  }));
}

export function RequestTypesAdmin({ types }: { types: AdminType[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [approverMode, setApproverMode] = useState<"manager" | "company">("manager");
  const [drafts, setDrafts] = useState<DraftField[]>([{ ...EMPTY }]);
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateDraft(i: number, patch: Partial<DraftField>) {
    setDrafts((ds) => ds.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function beginEdit(t: AdminType) {
    setOpen(true);
    setEditingId(t.id);
    setName(t.name);
    setApproverMode((t.approverMode as "manager" | "company") ?? "manager");
    setDrafts(toDrafts(t.fields));
    setSteps(t.steps.map((s) => ({ label: s.label, mode: s.approverMode as "manager" | "company" })));
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      name,
      approverMode,
      fields: drafts
        .filter((d) => d.label.trim())
        .map((d) => ({
          label: d.label,
          type: d.type,
          required: d.required,
          ...(d.type === "select"
            ? { options: d.options.split(",").map((o) => o.trim()).filter(Boolean) }
            : {}),
        })),
      steps: steps.filter((s) => s.label.trim()),
    };
    try {
      const url = editingId ? `/api/v1/request-types/${editingId}` : "/api/v1/request-types";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Save failed");
        return;
      }
      setOpen(false);
      setEditingId(null);
      setName("");
      setDrafts([{ ...EMPTY }]);
      setSteps([]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const formOpen = open;

  return (
    <Card>
      <CardHeader
        title={`Request types (${types.filter((t) => t.active).length} active)`}
        action={
          <button
            type="button"
            className={`${btn.secondary} ${btn.small}`}
            onClick={() => {
              setEditingId(null);
              setName("");
              setDrafts([{ ...EMPTY }]);
              setOpen((v) => !v);
            }}
          >
            {formOpen && editingId === null ? "Cancel" : "New type"}
          </button>
        }
      />

      {formOpen && (
        <form onSubmit={save} className="space-y-4 border-b border-[var(--color-line)] px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Name
              <input
                className={`${input} mt-1`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={80}
                placeholder="Travel booking"
              />
            </label>
            <label className="text-sm font-medium">
              Approved by
              <select
                className={`${input} mt-1`}
                value={approverMode}
                onChange={(e) => setApproverMode(e.target.value as "manager" | "company")}
              >
                <option value="manager">Requester&apos;s manager</option>
                <option value="company">Company approvers</option>
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Form fields</p>
            {drafts.map((d, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  className={`${input} w-44`}
                  placeholder={`Label ${i + 1}`}
                  value={d.label}
                  onChange={(e) => updateDraft(i, { label: e.target.value })}
                  aria-label={`Field ${i + 1} label`}
                />
                <select
                  className={`${input} w-32`}
                  value={d.type}
                  onChange={(e) => updateDraft(i, { type: e.target.value as DraftField["type"] })}
                  aria-label={`Field ${i + 1} type`}
                >
                  <option value="text">Text</option>
                  <option value="textarea">Long text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="select">Choice</option>
                </select>
                {d.type === "select" && (
                  <input
                    className={`${input} w-56`}
                    placeholder="Options, comma separated"
                    value={d.options}
                    onChange={(e) => updateDraft(i, { options: e.target.value })}
                    aria-label={`Field ${i + 1} options`}
                  />
                )}
                <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                  <input
                    type="checkbox"
                    checked={d.required}
                    onChange={(e) => updateDraft(i, { required: e.target.checked })}
                  />
                  Required
                </label>
                {drafts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setDrafts((ds) => ds.filter((_, idx) => idx !== i))}
                    className="text-xs text-danger hover:underline"
                  >
                    remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDrafts((ds) => [...ds, { ...EMPTY }])}
              className="text-xs font-medium text-[var(--color-brand-600)] hover:underline"
              disabled={drafts.length >= 12}
            >
              + Add field
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Approval chain (optional — overrides “approved by”)</p>
            {steps.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  className={`${input} w-44`}
                  placeholder={`Step ${i + 1} label`}
                  value={s.label}
                  onChange={(e) =>
                    setSteps((ss) => ss.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))
                  }
                  aria-label={`Step ${i + 1} label`}
                />
                <select
                  className={`${input} w-40`}
                  value={s.mode}
                  onChange={(e) =>
                    setSteps((ss) =>
                      ss.map((x, idx) => (idx === i ? { ...x, mode: e.target.value as DraftStep["mode"] } : x)),
                    )
                  }
                  aria-label={`Step ${i + 1} approvers`}
                >
                  <option value="manager">Requester&apos;s manager</option>
                  <option value="company">Company approvers</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSteps((ss) => ss.filter((_, idx) => idx !== i))}
                  className="text-xs text-danger hover:underline"
                >
                  remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSteps((ss) => [...ss, { label: "", mode: "manager" }])}
              className="text-xs font-medium text-[var(--color-brand-600)] hover:underline"
              disabled={steps.length >= 5}
            >
              + Add approval step
            </button>
          </div>

          <div>
            <button type="submit" disabled={busy} className={btn.primary}>
              {busy ? "Saving…" : editingId ? "Save changes" : "Create type"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="px-5 pt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="divide-y divide-[var(--color-line)]">
        {types.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {t.name} {!t.active && <Badge tone="neutral">inactive</Badge>}
              </p>
              <p className="text-xs text-[var(--color-muted)]">
                {t.fields.length} field{t.fields.length === 1 ? "" : "s"} · approved by{" "}
                {t.approverMode === "company" ? "company approvers" : "manager"}
              </p>
            </div>
            {t.active && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => beginEdit(t)}
                  disabled={busy}
                  className={`${btn.secondary} ${btn.small}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const res = await fetch(`/api/v1/request-types/${t.id}`, { method: "DELETE" });
                      if (!res.ok) {
                        const d = (await res.json()) as { error?: { message?: string } };
                        setError(d.error?.message ?? "Deactivate failed");
                        return;
                      }
                      router.refresh();
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className={`${btn.danger} ${btn.small}`}
                >
                  Deactivate
                </button>
              </div>
            )}
          </li>
        ))}
        {types.length === 0 && (
          <li className="px-5 py-6 text-center text-sm text-[var(--color-muted)]">
            No custom request types yet.
          </li>
        )}
      </ul>
    </Card>
  );
}
