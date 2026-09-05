"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { passwordStrongEnough } from "@/lib/password-policy";
import { btn, input } from "@/components/ui";

function ResetInner() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    if (password !== String(f.get("confirm") ?? "")) {
      setError("Passwords do not match");
      return;
    }
    if (!passwordStrongEnough(password)) {
      setError("Use at least 10 characters with a letter and a number");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/v1/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const d = (await res.json()) as { error?: { message?: string } };
    setBusy(false);
    if (!res.ok) {
      setError(d.error?.message ?? "This reset link is invalid or has expired.");
      return;
    }
    router.push("/login");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-line)] bg-surface p-6">
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <input className={input} type="password" name="password" required minLength={10} autoComplete="new-password" />
          <input className={input} type="password" name="confirm" required minLength={10} autoComplete="new-password" placeholder="Confirm" />
          <button type="submit" className={`${btn.primary} w-full`} disabled={busy || !token}>
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-[var(--color-brand-600)] hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}
