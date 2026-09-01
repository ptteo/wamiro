"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, CardHeader, btn, input } from "./ui";

export function SecurityClient({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<{ secret: string; uri: string; qrDataUrl?: string } | null>(
    null,
  );

  async function beginSetup() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/me/mfa", { method: "POST" });
      if (!res.ok) {
        setError("Could not start setup");
        return;
      }
      setEnrollment((await res.json()) as { secret: string; uri: string; qrDataUrl?: string });
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/me/mfa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: f.get("code") }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Verification failed");
        return;
      }
      setEnrollment(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function disable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/me/mfa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: f.get("password") }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not disable MFA");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Two-factor authentication"
        action={<Badge tone={enabled ? "green" : "amber"}>{enabled ? "Enabled" : "Off"}</Badge>}
      />

      {enabled ? (
        <form onSubmit={disable} className="space-y-3 px-5 py-4">
          <p className="text-sm text-[var(--color-muted)]">
            Enter your password to turn off two-factor authentication.
          </p>
          <input
            type="password"
            name="password"
            className={input}
            placeholder="Current password"
            required
            autoComplete="current-password"
          />
          <button type="submit" disabled={busy} className={`${btn.danger} ${btn.small}`}>
            Disable MFA
          </button>
        </form>
      ) : enrollment ? (
        <form onSubmit={confirm} className="space-y-3 px-5 py-4">
          <p className="text-sm">
            Add this secret to your authenticator app, then enter the current code.
          </p>
          <div className="rounded-lg bg-surface-subtle p-3">
            {enrollment.qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- data URL from our own API
              <img
                src={enrollment.qrDataUrl}
                alt="QR code for authenticator app"
                className="mx-auto mb-2 h-40 w-40 rounded-lg border border-[var(--color-line)] bg-surface p-1"
              />
            )}
            <p className="break-all font-mono text-xs text-[var(--color-muted)]">{enrollment.secret}</p>
          </div>
          <input
            name="code"
            className={`${input} max-w-40 text-center font-mono tracking-[0.3em]`}
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            required
            autoFocus
          />
          <div>
            <button type="submit" disabled={busy} className={btn.primary}>
              Verify & enable
            </button>
          </div>
        </form>
      ) : (
        <div className="px-5 py-4">
          <p className="text-sm text-[var(--color-muted)]">
            Use an authenticator app (Google Authenticator, Authy, 1Password…) as a second factor
            at sign-in.
          </p>
          <button type="button" onClick={beginSetup} disabled={busy} className={`${btn.primary} mt-3`}>
            Set up authenticator
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="px-5 pb-4 text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
