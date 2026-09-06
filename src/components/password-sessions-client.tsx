"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { passwordScore, passwordStrongEnough } from "@/lib/password-policy";
import { btn, input } from "./ui";

export function ChangePasswordForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [next, setNext] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const current = String(f.get("current") ?? "");
    if (!passwordStrongEnough(next)) {
      setError("Use at least 10 characters with a letter and a number");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/v1/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const d = (await res.json()) as { pending?: boolean; error?: { message?: string } };
      if (!res.ok) {
        setError(d.error?.message ?? "Could not change password");
        return;
      }
      setOk(d.pending ? "Requested. An admin will send you a reset link if they approve." : "Password updated. Other devices were signed out.");
      e.currentTarget.reset();
      setNext("");
    } finally {
      setBusy(false);
    }
  }

  const score = passwordScore(next);
  return (
    <form onSubmit={onSubmit} className="space-y-3 p-4 sm:p-5">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {ok ? <p className="text-sm text-success">{ok}</p> : null}
      <input className={input} type="password" name="current" required autoComplete="current-password" placeholder="Current password" />
      <input
        className={input}
        type="password"
        required
        minLength={10}
        autoComplete="new-password"
        placeholder="New password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded ${score >= i ? "bg-brand" : "bg-border-subtle"}`} />
        ))}
      </div>
      <button type="submit" className={btn.primary} disabled={busy}>
        {busy ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}

interface SessionRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  current: boolean;
}

export function OwnSessions() {
  const router = useRouter();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/v1/me/sessions");
    if (!res.ok) {
      setError("Could not load sessions");
      return;
    }
    const d = (await res.json()) as { sessions: SessionRow[] };
    setRows(d.sessions);
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(id?: string) {
    const q = id ? `?id=${encodeURIComponent(id)}` : "";
    const res = await fetch(`/api/v1/me/sessions${q}`, { method: "DELETE" });
    if (!res.ok) {
      const d = (await res.json()) as { error?: { message?: string } };
      setError(d.error?.message ?? "Could not revoke");
      return;
    }
    await load();
    router.refresh();
  }

  return (
    <div className="p-4 sm:p-5">
      {error ? <p className="mb-2 text-sm text-danger">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-tertiary">No other sessions.</p>
      ) : (
        <ul className="divide-y divide-border-subtle text-sm">
          {rows.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {s.current ? <strong>This device</strong> : shortUA(s.userAgent)}
                {s.ip ? ` · ${s.ip}` : ""}
                <span className="block text-xs text-tertiary">{new Date(s.createdAt).toLocaleString()}</span>
              </span>
              {s.current ? null : (
                <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => revoke(s.id)}>
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {rows.some((s) => !s.current) ? (
        <button type="button" className={`${btn.secondary} ${btn.small} mt-3`} onClick={() => revoke()}>
          Sign out other devices
        </button>
      ) : null}
    </div>
  );
}

function shortUA(ua: string | null) {
  if (!ua) return "Unknown device";
  return ua.length > 60 ? `${ua.slice(0, 60)}…` : ua;
}
