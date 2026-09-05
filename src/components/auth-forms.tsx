"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { btn, input } from "./ui";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  // MFA second step: hold step-one credentials + pending token
  const [mfa, setMfa] = useState<{ token: string; email: string; password: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const form = new FormData(e.currentTarget);

    let payload: Record<string, unknown>;
    if (mfa) {
      payload = {
        email: mfa.email,
        password: mfa.password,
        mfaToken: mfa.token,
        totpCode: form.get("totpCode"),
      };
    } else if (mode === "login") {
      payload = {
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      };
    } else {
      payload = {
        companyName: form.get("companyName"),
        adminName: form.get("adminName"),
        email: form.get("email"),
        password: form.get("password"),
      };
    }

    try {
      const res = await fetch(`/api/v1/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        redirect?: string | null;
        mfaRequired?: boolean;
        mfaToken?: string;
        error?: { message: string; details?: { fieldErrors?: Record<string, string[]> } };
      };
      if (!res.ok) {
        setError(data.error?.message ?? "Something went wrong");
        setFieldErrors(data.error?.details?.fieldErrors ?? {});
        return;
      }
      if (data.mfaRequired && data.mfaToken && !mfa) {
        setMfa({
          token: data.mfaToken,
          email: String(payload["email"] ?? ""),
          password: String(payload["password"] ?? ""),
        });
        return;
      }
      router.push(data.redirect ?? "/home");
      router.refresh();
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {mfa ? (
        <>
          <p className="text-sm text-[var(--color-muted)]">
            Enter the 6-digit code from your authenticator app.
          </p>
          <label className="block text-sm font-medium">
            Authentication code
            <input
              className={`${input} mt-1 text-center font-mono text-lg tracking-[0.4em]`}
              name="totpCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
            />
          </label>
        </>
      ) : (
        <>
          {mode === "register" && (
            <>
              <Field label="Company name" name="companyName" error={fieldErrors["companyName"]?.[0]}>
                <input
                  className={input}
                  name="companyName"
                  placeholder="Acme Inc."
                  required
                  minLength={2}
                  autoComplete="organization"
                />
              </Field>
              <Field label="Your name" name="adminName" error={fieldErrors["adminName"]?.[0]}>
                <input className={input} name="adminName" placeholder="Jane Cooper" required autoComplete="name" />
              </Field>
            </>
          )}
          <Field label="Work email" name="email" error={fieldErrors["email"]?.[0]}>
            <input className={input} type="email" name="email" required autoComplete="email" />
          </Field>
          <Field label="Password" name="password" error={fieldErrors["password"]?.[0]}>
            <input
              className={input}
              type="password"
              name="password"
              required
              minLength={mode === "register" ? 10 : 1}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </Field>
          {mode === "login" && !mfa ? (
            <p className="text-right text-sm">
              <a href="/forgot-password" className="text-[var(--color-brand-600)] hover:underline">
                Forgot password?
              </a>
            </p>
          ) : null}
          {mode === "register" && (
            <p className="text-xs text-[var(--color-muted)]">
              Minimum 10 characters. You become this workspace&apos;s first administrator.
            </p>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className={`${btn.primary} w-full`}>
        {busy
          ? "Working…"
          : mfa
            ? "Verify code"
            : mode === "login"
              ? "Sign in"
              : "Create workspace"}
      </button>
      {mfa && (
        <button type="button" onClick={() => setMfa(null)} className={`${btn.secondary} w-full`}>
          Start over
        </button>
      )}
    </form>
  );
}

function Field({
  label,
  name,
  error,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-[var(--color-ink)]">
        {label}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
