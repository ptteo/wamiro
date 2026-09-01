"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, CardHeader, EmptyState, btn, input } from "./ui";

interface Ticket {
  id: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  requesterName: string;
  createdAt: string;
}

const STATUS_TONE: Record<string, "neutral" | "amber" | "green" | "red" | "brand"> = {
  new: "amber",
  open: "brand",
  waiting: "amber",
  resolved: "green",
  closed: "neutral",
};

export function TicketsClient({
  tickets,
  canManage,
  canCreate,
}: {
  tickets: Ticket[];
  canManage: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createTicket(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: f.get("title"),
          description: f.get("description"),
          category: f.get("category"),
          priority: f.get("priority"),
        }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not create ticket");
        return;
      }
      setCreating(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {canCreate && (
        <div>
          <button type="button" className={btn.primary} onClick={() => setCreating((v) => !v)}>
            {creating ? "Cancel" : "New ticket"}
          </button>
        </div>
      )}

      {creating && (
        <Card>
          <CardHeader title="New ticket" />
          <form onSubmit={createTicket} className="space-y-3 px-5 py-4">
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <label className="block text-sm font-medium">
              Title
              <input name="title" required minLength={3} maxLength={300} className={`${input} mt-1`} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Category
                <select name="category" className={`${input} mt-1`} defaultValue="other">
                  <option value="incident">Incident</option>
                  <option value="service_request">Service request</option>
                  <option value="access">Access</option>
                  <option value="hardware">Hardware</option>
                  <option value="software">Software</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Priority
                <select name="priority" className={`${input} mt-1`} defaultValue="medium">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
            </div>
            <label className="block text-sm font-medium">
              Description
              <textarea
                name="description"
                required
                minLength={5}
                maxLength={10_000}
                className={`${input} mt-1 min-h-24`}
              />
            </label>
            <button type="submit" disabled={busy} className={btn.primary}>
              Submit ticket
            </button>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader title={`Tickets (${tickets.length})`} />
        {tickets.length === 0 ? (
          <EmptyState
            title="No tickets yet"
            hint={canManage ? "Submit a support ticket to get started." : "Support tickets will appear here."}
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {tickets.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {t.category} · {new Date(t.createdAt).toLocaleDateString()}
                    {t.requesterName ? ` · ${t.requesterName}` : ""}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
