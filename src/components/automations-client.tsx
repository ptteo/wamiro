"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, CardHeader, btn, input } from "./ui";

interface Rule {
  id: string;
  name: string;
  conditionField: string | null;
  conditionOp: string;
  conditionValue: string | null;
  notifyEmails: string[];
  active: boolean;
}

export function AutomationsClient({ rules }: { rules: Rule[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(url + method);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Action failed");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title={`Automation rules (${rules.filter((r) => r.active).length} active)`}
        action={
          <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => setCreating((v) => !v)}>
            {creating ? "Cancel" : "New rule"}
          </button>
        }
      />

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {creating && (
        <form
          className="space-y-3 border-b border-[var(--color-line)] px-5 py-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (
              await call("/api/v1/automations", "POST", {
                name: f.get("name"),
                conditionField: f.get("conditionField") || null,
                conditionOp: "gt",
                conditionValue: Number(f.get("conditionValue")) || null,
                notifyEmails: String(f.get("emails") ?? "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            ) {
              setCreating(false);
            }
          }}
        >
          <label className="block text-sm font-medium">
            Rule name
            <input name="name" className={`${input} mt-1`} required minLength={2} maxLength={120} placeholder="Escalate big expenses to CFO" />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium">
              Condition field
              <input name="conditionField" className={`${input} mt-1`} maxLength={60} placeholder="amount" />
            </label>
            <label className="text-sm font-medium">
              Operator
              <select name="conditionOp" className={`${input} mt-1`} defaultValue="gt">
                <option value="gt">&gt;</option>
                <option value="gte">&ge;</option>
                <option value="lt">&lt;</option>
                <option value="lte">&le;</option>
                <option value="eq">=</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Value
              <input type="number" step="any" name="conditionValue" className={`${input} mt-1`} />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Notify emails (comma separated)
            <input name="emails" className={`${input} mt-1`} placeholder="cfo@company.com, ops@company.com" />
          </label>
          <p className="text-xs text-[var(--color-muted)]">
            Fires when any request is created. Leave the condition field empty to match every request.
          </p>
          <button type="submit" disabled={busy !== null} className={btn.primary}>
            Create rule
          </button>
        </form>
      )}

      <ul className="divide-y divide-[var(--color-line)]">
        {rules.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.name}</p>
              <p className="text-xs text-[var(--color-muted)]">
                {r.conditionField
                  ? `when ${r.conditionField} ${r.conditionOp} ${r.conditionValue}`
                  : "matches all requests"}{" "}
                → notify {r.notifyEmails.join(", ")}
              </p>
            </div>
            {r.active && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => call(`/api/v1/automations/${r.id}`, "DELETE")}
                className={`${btn.danger} ${btn.small}`}
              >
                Deactivate
              </button>
            )}
          </li>
        ))}
        {rules.length === 0 && (
          <li className="px-5 py-6 text-center text-sm text-[var(--color-muted)]">No automation rules yet.</li>
        )}
      </ul>
    </Card>
  );
}
