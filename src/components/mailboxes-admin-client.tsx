"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, CardHeader, EmptyState, btn, input } from "./ui";

interface MailboxRow {
  id: string;
  email: string;
  imapHost: string;
  enabled: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

export function MailboxesAdminClient({ mailboxes }: { mailboxes: MailboxRow[] }) {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", imapHost: "", imapUser: "", imapPass: "" });

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, imapPort: 993, useSsl: true }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not connect mailbox");
        return;
      }
      setForm({ email: "", imapHost: "", imapUser: "", imapPass: "" });
      setConnecting(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(m: MailboxRow) {
    await fetch(`/api/v1/admin/mailboxes/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !m.enabled }),
    });
    router.refresh();
  }

  async function remove(m: MailboxRow) {
    if (!confirm(`Disconnect ${m.email}?`)) return;
    await fetch(`/api/v1/admin/mailboxes/${m.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={`Connected mailboxes (${mailboxes.length})`}
          action={
            <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => setConnecting((v) => !v)}>
              {connecting ? "Cancel" : "Connect inbox"}
            </button>
          }
        />
        {connecting && (
          <form onSubmit={connect} className="grid gap-3 border-t border-[var(--color-line)] px-5 py-4 sm:grid-cols-2">
            {error && <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p>}
            <label className="text-sm font-medium">
              Inbox email (senders email here)
              <input type="email" required className={`${input} mt-1`} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="support@yourcompany.com" />
            </label>
            <label className="text-sm font-medium">
              IMAP host
              <input required className={`${input} mt-1`} value={form.imapHost} onChange={(e) => setForm({ ...form, imapHost: e.target.value })} placeholder="imap.yourcompany.com" />
            </label>
            <label className="text-sm font-medium">
              IMAP user
              <input required className={`${input} mt-1`} value={form.imapUser} onChange={(e) => setForm({ ...form, imapUser: e.target.value })} />
            </label>
            <label className="text-sm font-medium">
              IMAP password / app password
              <input type="password" required className={`${input} mt-1`} value={form.imapPass} onChange={(e) => setForm({ ...form, imapPass: e.target.value })} />
            </label>
            <p className="text-xs text-[var(--color-muted)] sm:col-span-2">
              Emails from your employees become tickets (or replies on tickets whose subject carries the ticket id). Requires the worker
              (<code className="rounded bg-surface-subtle px-1">npm run mail:worker</code>) and <code className="rounded bg-surface-subtle px-1">npm i imapflow</code>.
            </p>
            <button type="submit" disabled={busy} className={`${btn.primary} ${btn.small} w-fit`}>
              {busy ? "Connecting…" : "Connect"}
            </button>
          </form>
        )}
        {!connecting && mailboxes.length === 0 && (
          <EmptyState title="No inbox connected" hint="Connect one to turn emails into tickets." />
        )}
        {mailboxes.length > 0 && (
          <ul className="divide-y divide-[var(--color-line)]">
            {mailboxes.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-primary">{m.email}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {m.imapHost}
                    {m.lastSyncAt ? ` · last sync ${new Date(m.lastSyncAt).toLocaleString()}` : " · never synced"}
                  </p>
                  {m.lastError && <p className="text-xs text-danger">Last error: {m.lastError}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {m.enabled ? <Badge tone="green">Polling</Badge> : <Badge tone="amber">Paused</Badge>}
                  <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => void toggleEnabled(m)}>
                    {m.enabled ? "Pause" : "Resume"}
                  </button>
                  <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => void remove(m)}>
                    Disconnect
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}