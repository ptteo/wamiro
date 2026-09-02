"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Shield, ShieldCheck } from "lucide-react";

import { Badge, btn, input } from "./ui";

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
    <section className="rounded-lg border border-border-subtle bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-primary">Two-factor authentication</h2>
          <p className="mt-0.5 text-xs text-tertiary">Authenticator app at sign-in.</p>
        </div>
        <Badge tone={enabled ? "success" : "amber"}>{enabled ? "On" : "Off"}</Badge>
      </div>

      <div className="flex items-start gap-3 px-4 pt-4 sm:px-5">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            enabled ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"
          }`}
        >
          {enabled ? <ShieldCheck className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
        </span>
        <p className="text-sm text-secondary">
          {enabled
            ? "This account requires an authenticator code after the password."
            : "Use Google Authenticator, Authy, or 1Password as a second factor."}
        </p>
      </div>

      {enabled ? (
        <form onSubmit={disable} className="space-y-3 p-4 sm:p-5">
          <input
            type="password"
            name="password"
            className={input}
            placeholder="Current password"
            required
            autoComplete="current-password"
          />
          <button type="submit" disabled={busy} className={btn.danger}>
            Disable MFA
          </button>
        </form>
      ) : enrollment ? (
        <form onSubmit={confirm} className="space-y-3 p-4 sm:p-5">
          <p className="text-sm text-secondary">
            Scan the code, or type the secret into your app, then enter the 6-digit code.
          </p>
          <div className="rounded-lg border border-border-subtle bg-surface-subtle p-3">
            {enrollment.qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL from our own API
              <img
                src={enrollment.qrDataUrl}
                alt="QR code for authenticator app"
                className="mx-auto mb-2 h-40 w-40 rounded-lg border border-border-default bg-surface p-1"
              />
            ) : null}
            <p className="break-all text-center font-mono text-xs text-tertiary">{enrollment.secret}</p>
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
          <button type="submit" disabled={busy} className={btn.primary}>
            Verify & enable
          </button>
        </form>
      ) : (
        <div className="p-4 sm:p-5">
          <button type="button" onClick={beginSetup} disabled={busy} className={btn.primary}>
            Set up authenticator
          </button>
        </div>
      )}

      {error ? (
        <p role="alert" className="px-4 pb-4 text-sm text-danger sm:px-5">
          {error}
        </p>
      ) : null}
    </section>
  );
}
