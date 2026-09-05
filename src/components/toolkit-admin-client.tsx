"use client";

import { useState } from "react";

import { Card, CardHeader, EmptyState, btn, input } from "./ui";

interface Canned {
  id: string;
  name: string;
  category: string | null;
  body: string;
}

interface MacroAction {
  op: string;
  value: string;
}

interface Macro {
  id: string;
  name: string;
  description: string | null;
  actions: MacroAction[];
}

const OPS = ["set_status", "set_priority", "assign", "add_tag", "add_reply", "add_note"] as const;

function MacroActionsEditor({
  actions,
  onChange,
}: {
  actions: MacroAction[];
  onChange: (next: MacroAction[]) => void;
}) {
  function patch(i: number, field: "op" | "value", v: string) {
    onChange(actions.map((a, idx) => (idx === i ? { ...a, [field]: v } : a)));
  }
  return (
    <div className="space-y-1.5">
      {actions.map((a, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <select value={a.op} onChange={(e) => patch(i, "op", e.target.value)} className={`${input} h-8 w-36 text-xs`}>
            {OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            value={a.value}
            onChange={(e) => patch(i, "value", e.target.value)}
            placeholder={a.op === "assign" ? 'user id or "unassigned"' : a.op.startsWith("add_") ? "body text / tag" : "value"}
            className={`${input} h-8 min-w-40 flex-1 text-xs`}
          />
          <button
            type="button"
            aria-label="Remove action"
            onClick={() => onChange(actions.filter((_, idx) => idx !== i))}
            className="text-xs text-tertiary hover:text-danger"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function ToolkitAdminClient({
  data,
}: {
  data: { canned: Canned[]; macros: Macro[] };
}) {
  const [canned, setCanned] = useState<Canned[]>(data.canned);
  const [macros, setMacros] = useState<Macro[]>(data.macros);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [cannedName, setCannedName] = useState("");
  const [cannedCategory, setCannedCategory] = useState("");
  const [cannedBody, setCannedBody] = useState("");
  const [macroName, setMacroName] = useState("");
  const [macroDesc, setMacroDesc] = useState("");
  const [macroActions, setMacroActions] = useState<MacroAction[]>([
    { op: "add_reply", value: "" },
  ]);

  async function createCanned(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/tickets/canned-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cannedName, category: cannedCategory || null, body: cannedBody }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not create canned response");
        return;
      }
      const created = (await res.json()) as Canned;
      setCanned((prev) => [...prev, created]);
      setCannedName("");
      setCannedCategory("");
      setCannedBody("");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCanned(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tickets/canned-responses/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not delete canned response");
        return;
      }
      setCanned((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setBusy(false);
    }
  }

  async function createMacro(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/tickets/macros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: macroName,
          description: macroDesc || null,
          actions: macroActions.filter((a) => a.value.trim().length > 0),
        }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not create macro");
        return;
      }
      const created = (await res.json()) as Macro;
      setMacros((prev) => [...prev, created]);
      setMacroName("");
      setMacroDesc("");
      setMacroActions([{ op: "add_reply", value: "" }]);
    } finally {
      setBusy(false);
    }
  }

  async function deleteMacro(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tickets/macros/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not delete macro");
        return;
      }
      setMacros((prev) => prev.filter((m) => m.id !== id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader title="Canned responses" subtitle="Reusable snippets agents insert into replies with one click." />
        {canned.length > 0 ? (
          <ul className="mt-2 divide-y divide-border-subtle">
            {canned.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary">
                    {c.name}
                    {c.category ? <span className="ml-2 text-xs text-tertiary">{c.category}</span> : null}
                  </p>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-secondary">{c.body}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteCanned(c.id)}
                  className="shrink-0 text-xs text-tertiary hover:text-danger"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No canned responses" hint="Create one below — agents can then insert it into any reply." />
        )}
        <form onSubmit={createCanned} className="mt-3 grid gap-2 border-t border-border-subtle pt-3 sm:grid-cols-2">
          <input
            value={cannedName}
            onChange={(e) => setCannedName(e.target.value)}
            required
            placeholder="Name, e.g. Password reset steps"
            className={`${input} h-9`}
          />
          <input
            value={cannedCategory}
            onChange={(e) => setCannedCategory(e.target.value)}
            placeholder="Category (optional)"
            className={`${input} h-9`}
          />
          <textarea
            value={cannedBody}
            onChange={(e) => setCannedBody(e.target.value)}
            required
            placeholder="Response body…"
            className={`${input} min-h-20 sm:col-span-2`}
          />
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy || !cannedName || !cannedBody} className={`${btn.primary} ${btn.small}`}>
              {busy ? "Saving…" : "Add canned response"}
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Macros" subtitle="Named multi-step actions applied to a ticket in one click." />
        {macros.length > 0 ? (
          <ul className="mt-2 divide-y divide-border-subtle">
            {macros.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary">{m.name}</p>
                  {m.description ? <p className="text-xs text-tertiary">{m.description}</p> : null}
                  <p className="mt-0.5 text-xs text-secondary">
                    {m.actions.map((a) => `${a.op}: ${a.value.slice(0, 40)}`).join(" → ")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteMacro(m.id)}
                  className="shrink-0 text-xs text-tertiary hover:text-danger"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No macros" hint="Create one below — it appears on every ticket for agents." />
        )}
        <form onSubmit={createMacro} className="mt-3 space-y-2 border-t border-border-subtle pt-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={macroName}
              onChange={(e) => setMacroName(e.target.value)}
              required
              placeholder="Macro name, e.g. Resolve password reset"
              className={`${input} h-9`}
            />
            <input
              value={macroDesc}
              onChange={(e) => setMacroDesc(e.target.value)}
              placeholder="Description (optional)"
              className={`${input} h-9`}
            />
          </div>
          <MacroActionsEditor actions={macroActions} onChange={setMacroActions} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMacroActions((prev) => [...prev, { op: "add_reply", value: "" }])}
              className={`${btn.secondary} ${btn.small}`}
            >
              + Action
            </button>
            <button type="submit" disabled={busy || !macroName || macroActions.every((a) => !a.value.trim())} className={`${btn.primary} ${btn.small}`}>
              {busy ? "Saving…" : "Create macro"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}