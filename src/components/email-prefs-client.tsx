"use client";

import { useState } from "react";

import { btn, input } from "./ui";

const KINDS = [
  ["leave", "Leave"],
  ["request", "Requests"],
  ["ticket", "Tickets"],
  ["announcement", "Announcements"],
  ["task", "Tasks"],
  ["system", "System"],
] as const;

export function EmailPrefsClient({
  initial,
}: {
  initial: {
    kinds?: Record<string, boolean>;
    digest?: "off" | "weekly";
    quietHours?: { start: string; end: string; tz?: string } | null;
    lastDigestAt?: string;
  };
}) {
  const [kinds, setKinds] = useState<Record<string, boolean>>(() => {
    const next: Record<string, boolean> = {};
    for (const [k] of KINDS) next[k] = initial.kinds?.[k] !== false;
    return next;
  });
  const [digest, setDigest] = useState<"off" | "weekly">(initial.digest === "weekly" ? "weekly" : "off");
  const [start, setStart] = useState(initial.quietHours?.start ?? "22:00");
  const [end, setEnd] = useState(initial.quietHours?.end ?? "07:00");
  const [quietOn, setQuietOn] = useState(Boolean(initial.quietHours?.start));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/v1/me/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "emailPrefs",
          orgScoped: true,
          value: {
            kinds,
            digest,
            quietHours: quietOn ? { start, end } : null,
            lastDigestAt: initial.lastDigestAt,
          },
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not save email preferences");
        return;
      }
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 px-4 py-4 sm:px-5">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {saved ? <p className="text-sm text-success">Saved. In-app notifications still arrive.</p> : null}
      <fieldset>
        <legend className="text-sm font-medium text-primary">Email me about</legend>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {KINDS.map(([key, label]) => (
            <li key={key}>
              <label className="flex items-center gap-2 text-sm text-secondary">
                <input
                  type="checkbox"
                  checked={kinds[key] !== false}
                  onChange={(e) => setKinds((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
                {label}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <label className="block text-sm font-medium text-primary">
        Weekly digest
        <select
          className={`${input} mt-1`}
          value={digest}
          onChange={(e) => setDigest(e.target.value === "weekly" ? "weekly" : "off")}
        >
          <option value="off">Off — email each notification (when allowed)</option>
          <option value="weekly">Weekly summary of unread items</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-secondary">
        <input type="checkbox" checked={quietOn} onChange={(e) => setQuietOn(e.target.checked)} />
        Quiet hours (skip email, keep in-app)
      </label>
      {quietOn ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-primary">
            Start
            <input type="time" className={`${input} mt-1`} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-primary">
            End
            <input type="time" className={`${input} mt-1`} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
      ) : null}
      <button type="submit" disabled={busy} className={btn.primary}>
        {busy ? "Saving…" : "Save email preferences"}
      </button>
    </form>
  );
}
