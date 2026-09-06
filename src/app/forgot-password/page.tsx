"use client";

import Link from "next/link";
import { useState } from "react";

import { btn, input } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    await fetch("/api/v1/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setDone(true);
    setBusy(false);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-line)] bg-surface p-6">
        <h1 className="text-xl font-semibold">Forgot password</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          If that mailbox has an account, we will send a reset link. It expires in 30 minutes.
        </p>
        {done ? (
          <p className="mt-4 text-sm text-primary">Check your email. You can close this page.</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-5 space-y-3">
            <input className={input} type="email" name="email" required autoComplete="email" placeholder="you@company.com" />
            <button type="submit" className={`${btn.primary} w-full`} disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-[var(--color-brand-600)] hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
