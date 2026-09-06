"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { isGatedPagePath } from "@/modules/org/gates";
import { btn } from "./ui";

export function AppGates({
  mfaRequired,
  onboardingIncomplete,
  children,
}: {
  mfaRequired: boolean;
  onboardingIncomplete: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/home";
  const router = useRouter();

  useEffect(() => {
    if (mfaRequired && !pathname.startsWith("/settings/security")) {
      router.replace("/settings/security?mfa=required");
    }
  }, [mfaRequired, pathname, router]);

  if (mfaRequired && !pathname.startsWith("/settings/security")) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface p-6">
        <h1 className="text-lg font-semibold text-primary">Enable two-factor authentication</h1>
        <p className="mt-1 text-sm text-secondary">Your company requires MFA before you can continue.</p>
        <Link href="/settings/security?mfa=required" className={`${btn.primary} mt-4 inline-flex`}>
          Open Security
        </Link>
      </div>
    );
  }

  if (onboardingIncomplete && isGatedPagePath(pathname)) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface p-6">
        <h1 className="text-lg font-semibold text-primary">Finish company setup</h1>
        <p className="mt-1 text-sm text-secondary">
          Daily tools open after branding, team, and a first announcement are in place. Admin, People, and Settings stay
          available.
        </p>
        <Link href="/setup" className={`${btn.primary} mt-4 inline-flex`}>
          Continue setup
        </Link>
      </div>
    );
  }

  return children;
}
