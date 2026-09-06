import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-forms";
import { readSessionToken } from "@/lib/session";
import { resolveOrgForHostCached, verifyCustomDomain } from "@/modules/org/host";
import { isSsoAvailable } from "@/modules/sso/service";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const token = await readSessionToken();
  if (token) redirect("/home");

  // White-label (Phase D): when the request arrives on a tenant host
  // (<slug>.platform or a verified custom domain) brand the page with the
  // company and offer its SSO. Custom domains self-verify on first visit.
  const host = (await headers()).get("host") ?? "";
  const tenant = await resolveOrgForHostCached(host).catch(() => null);
  if (tenant?.needsVerification) {
    void verifyCustomDomain(tenant.id).catch(() => {});
  }
  const sso = tenant ? await isSsoAvailable(tenant.id).catch(() => false) : false;
  const brandColor = tenant?.primaryColor ?? "var(--color-brand-600)";

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ background: brandColor }}
          >
            {tenant ? tenant.name.slice(0, 1).toUpperCase() : "W"}
          </div>
          <h1 className="text-xl font-semibold text-[var(--color-ink)]">
            {tenant ? `Sign in to ${tenant.name}` : "Sign in to Wamiro"}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {tenant
              ? "Your company portal — one login for everything it runs on."
              : "One login for everything your company runs on."}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--color-line)] bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          {sso && tenant ? (
            <>
              <a
                href={`/api/v1/auth/sso/initiate?org=${encodeURIComponent(tenant.slug)}&redirect=${encodeURIComponent("/home")}`}
                className="flex h-9 w-full items-center justify-center rounded-lg font-medium text-white transition hover:opacity-90"
                style={{ background: brandColor }}
              >
                Continue with single sign-on
              </a>
              <div className="my-4 flex items-center gap-3 text-xs text-[var(--color-muted)]">
                <span className="h-px flex-1 bg-[var(--color-line)]" aria-hidden />
                or sign in with a password
                <span className="h-px flex-1 bg-[var(--color-line)]" aria-hidden />
              </div>
            </>
          ) : null}
          <AuthForm mode="login" initialError={(await searchParams).error ?? null} />
        </div>
        {!tenant ? (
          <p className="mt-4 text-center text-sm text-[var(--color-muted)]">
            New organization?{" "}
            <Link href="/register" className="font-medium text-[var(--color-brand-600)] hover:underline">
              Create a workspace
            </Link>
          </p>
        ) : (
          <p className="mt-4 text-center text-sm text-[var(--color-muted)]">
            Signed in on the wrong workspace?{" "}
            <a href={`https://${new URL(process.env.APP_URL ?? "http://localhost:3000").host}`} className="font-medium text-[var(--color-brand-600)] hover:underline">
              Go to Wamiro
            </a>
          </p>
        )}
      </div>
    </main>
  );
}