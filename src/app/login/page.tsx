import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-forms";
import { readSessionToken } from "@/lib/session";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const token = await readSessionToken();
  if (token) redirect("/home");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-brand-600)] text-lg font-bold text-white">
            W
          </div>
          <h1 className="text-xl font-semibold text-[var(--color-ink)]">Sign in to Wamiro</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            One login for everything your company runs on.
          </p>
        </div>
        <div className="rounded-xl border border-[var(--color-line)] bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          <AuthForm mode="login" />
        </div>
        <p className="mt-4 text-center text-sm text-[var(--color-muted)]">
          New organization?{" "}
          <Link href="/register" className="font-medium text-[var(--color-brand-600)] hover:underline">
            Create a workspace
          </Link>
        </p>
      </div>
    </main>
  );
}
