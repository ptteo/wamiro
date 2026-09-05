"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, CardHeader, EmptyState, btn, input } from "./ui";

interface ItRecordRow {
  id: string;
  type: string;
  title: string;
  impact: string;
  priority: string;
  status: string;
  affectedService: string;
  ownerName: string;
  ticketCount: number;
  updatedAt: string;
}

const TYPES = ["incident", "problem", "change"] as const;

const STATUS_BY_TYPE: Record<string, string[]> = {
  incident: ["new", "investigating", "identified", "monitoring", "resolved", "closed"],
  problem: ["open", "investigating", "root_cause_identified", "known_error", "closed"],
  change: ["draft", "planned", "approved", "implemented", "verified", "rolled_back"],
};

const PRIORITY_TONE: Record<string, "neutral" | "brand" | "amber" | "red"> = {
  low: "neutral",
  medium: "brand",
  high: "amber",
  urgent: "red",
};

const CATEGORY_LABEL: Record<string, string> = {
  incident: "Incidents",
  problem: "Problems",
  change: "Changes",
};

export function ItRecordsClient({
  initialType,
  initialRecords,
  ticketOptions,
}: {
  initialType: string;
  initialRecords: ItRecordRow[];
  ticketOptions: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [type, setType] = useState<string>(initialType);
  const [records, setRecords] = useState<ItRecordRow[]>(initialRecords);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [linkTicketId, setLinkTicketId] = useState("");

  async function switchType(t: string) {
    setType(t);
    setOpenId(null);
    setCreating(false);
    const res = await fetch(`/api/v1/it-records?type=${t}`);
    if (res.ok) {
      const body = (await res.json()) as { records: ItRecordRow[] };
      setRecords(body.records);
    }
    router.replace(`/tickets/it-records?type=${t}`, { scroll: false });
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/it-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: f.get("title"),
          description: f.get("description"),
          impact: f.get("impact"),
          priority: f.get("priority"),
          affectedService: f.get("affectedService"),
        }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not create record");
        return;
      }
      setCreating(false);
      await switchType(type);
    } finally {
      setBusy(false);
    }
  }

  async function patchStatus(id: string, status: string) {
    await fetch(`/api/v1/it-records/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await switchType(type);
  }

  async function linkTicket(id: string) {
    if (!linkTicketId) return;
    await fetch(`/api/v1/it-records/${id}/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: linkTicketId }),
    });
    setLinkTicketId("");
    await switchType(type);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-[var(--color-line)] bg-surface p-1">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => void switchType(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                type === t ? "bg-surface-hover text-primary shadow-sm" : "text-tertiary hover:text-primary"
              }`}
            >
              {CATEGORY_LABEL[t]}
            </button>
          ))}
        </div>
        <button type="button" className={`${btn.primary} ${btn.small}`} onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : `New ${type}`}
        </button>
      </div>

      {creating && (
        <Card>
          <CardHeader title={`New ${type}`} />
          <form onSubmit={create} className="space-y-3 px-5 py-4">
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <label className="block text-sm font-medium">
              Title
              <input name="title" required minLength={3} className={`${input} mt-1`} />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm font-medium">
                Priority
                <select name="priority" className={`${input} mt-1`} defaultValue="medium">
                  {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">
                Impact
                <input name="impact" className={`${input} mt-1`} placeholder="e.g. all of Sales" />
              </label>
              <label className="text-sm font-medium">
                Affected service
                <input name="affectedService" className={`${input} mt-1`} placeholder="e.g. VPN" />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Description
              <textarea name="description" className={`${input} mt-1 min-h-24`} />
            </label>
            <button type="submit" disabled={busy} className={btn.primary}>{busy ? "Creating…" : "Create record"}</button>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader title={`${CATEGORY_LABEL[type] ?? type} (${records.length})`} />
        {records.length === 0 ? (
          <EmptyState title="Nothing here" hint="Open records will appear in this queue." />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {records.map((r) => (
              <li key={r.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-medium text-primary hover:underline"
                    onClick={() => setOpenId(openId === r.id ? null : r.id)}
                  >
                    {r.title}
                  </button>
                  <Badge tone={PRIORITY_TONE[r.priority] ?? "neutral"}>{r.priority}</Badge>
                  <Badge tone="neutral">{r.status}</Badge>
                  {r.ownerName && <span className="text-xs text-tertiary">→ {r.ownerName}</span>}
                </div>
                {openId === r.id && (
                  <div className="mt-3 rounded-md border border-[var(--color-line)] bg-surface-subtle px-4 py-3 text-sm">
                    {r.impact && <p className="text-xs text-tertiary">Impact: {r.impact}</p>}
                    {r.affectedService && <p className="text-xs text-tertiary">Service: {r.affectedService}</p>}
                    <p className="mt-1 text-xs text-tertiary">
                      {r.ticketCount} linked ticket{r.ticketCount === 1 ? "" : "s"} · updated {new Date(r.updatedAt).toLocaleString()}
                    </p>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <label className="text-xs font-medium">
                        Status
                        <select
                          className={`${input} mt-1 h-8 w-48`}
                          value={r.status}
                          onChange={(e) => void patchStatus(r.id, e.target.value)}
                        >
                          {(STATUS_BY_TYPE[r.type] ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-medium">
                        Link ticket
                        <select className={`${input} mt-1 h-8 w-64`} value={linkTicketId} onChange={(e) => setLinkTicketId(e.target.value)}>
                          <option value="">Select an open ticket…</option>
                          {ticketOptions.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                        </select>
                      </label>
                      <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => void linkTicket(r.id)}>
                        Link
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}