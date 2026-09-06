"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { passwordScore, passwordStrongEnough } from "@/lib/password-policy";
import { btn, input } from "./ui";

export function InviteAcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<{ name: string; orgName: string; email: string; primaryColor: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!token) {
      setError("This invite is invalid or has expired. Ask your admin for a new one.");
      return;
    }
    void fetch(`/api/v1/invitations/accept?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = (await r.json()) as { invite?: { name: string; orgName: string; email: string; primaryColor: string }; error?: { message?: string } };
        if (!r.ok || !d.invite) throw new Error(d.error?.message ?? "Invalid invite");
        setInfo(d.invite);
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const confirm = String(new FormData(e.currentTarget).get("confirm") ?? "");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!passwordStrongEnough(password)) {
      setError("Use at least 10 characters with a letter and a number");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = (await res.json()) as { redirect?: string; error?: { message?: string } };
      if (!res.ok) {
        setError(d.error?.message ?? "Could not accept invite");
        return;
      }
      router.push(d.redirect ?? "/home");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const score = passwordScore(password);
  const brand = info?.primaryColor ?? "var(--color-brand-600)";

  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <div
        className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white"
        style={{ background: brand }}
      >
        {(info?.orgName ?? "W").slice(0, 1).toUpperCase()}
      </div>
      <h1 className="text-center text-xl font-semibold text-[var(--color-ink)]">
        {info ? `Join ${info.orgName}` : "Accept invite"}
      </h1>
      {info ? (
        <p className="mt-1 text-center text-sm text-[var(--color-muted)]">
          {info.name} · {info.email}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {info ? (
        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <label className="block text-sm font-medium">
            Password
            <input
              className={`${input} mt-1`}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
            />
          </label>
          <div className="flex gap-1" aria-hidden>
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded ${score >= i ? "bg-brand" : "bg-border-subtle"}`}
              />
            ))}
          </div>
          <label className="block text-sm font-medium">
            Confirm password
            <input className={`${input} mt-1`} type="password" name="confirm" autoComplete="new-password" required />
          </label>
          <button type="submit" className={`${btn.primary} w-full`} disabled={busy}>
            {busy ? "Joining…" : "Set password and join"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
