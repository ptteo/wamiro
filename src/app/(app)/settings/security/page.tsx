import { eq } from "drizzle-orm";

import { ChangePasswordForm, OwnSessions } from "@/components/password-sessions-client";
import { EmailPrefsClient } from "@/components/email-prefs-client";
import { SecurityClient } from "@/components/security-client";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { parseEmailPrefs } from "@/lib/email-prefs";
import { requireAuthPage } from "@/lib/page-auth";
import { getMergedPreferences } from "@/modules/prefs/service";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

export const metadata = { title: "Security" };

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ mfa?: string }>;
}) {
  const mfaRequired = (await searchParams).mfa === "required";
  const ctx = await requireAuthPage();
  const [row] = await db
    .select({ totpEnabled: users.totpEnabled })
    .from(users)
    .where(eq(users.id, ctx.user.id))
    .limit(1);
  const prefs = await getMergedPreferences(ctx.user.id, ctx.user.organizationId);
  const emailPrefs = parseEmailPrefs(prefs.emailPrefs);

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Security"
        subtitle="How this account signs in, and how long a session lasts."
      />
      {mfaRequired && !row?.totpEnabled ? (
        <p className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning">
          Your company requires two-factor authentication before you can use daily tools.
        </p>
      ) : null}

      <SecurityClient enabled={row?.totpEnabled ?? false} />

      <section className="rounded-lg border border-border-subtle bg-surface">
        <div className="border-b border-border-subtle px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-primary">Password</h2>
          <p className="mt-0.5 text-xs text-tertiary">Current password required. Other devices are signed out.</p>
        </div>
        <ChangePasswordForm />
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface">
        <div className="border-b border-border-subtle px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-primary">Email notifications</h2>
          <p className="mt-0.5 text-xs text-tertiary">
            Quiet hours skip email only. In-app notifications still arrive. Weekly digest uses the jobs worker.
          </p>
        </div>
        <EmailPrefsClient initial={emailPrefs} />
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface">
        <div className="border-b border-border-subtle px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-primary">Your sessions</h2>
          <p className="mt-0.5 text-xs text-tertiary">Sign out a device you no longer use.</p>
        </div>
        <OwnSessions />
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface">
        <div className="border-b border-border-subtle px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-primary">Session</h2>
        </div>
        <ul className="divide-y divide-border-subtle text-sm">
          <li className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span className="text-tertiary">Expires after</span>
            <span className="text-primary">14 days of inactivity</span>
          </li>
          <li className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span className="text-tertiary">Cookie</span>
            <span className="text-primary">httpOnly, SameSite=Lax</span>
          </li>
          <li className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span className="text-tertiary">Audit</span>
            <span className="text-primary sm:text-right">
              Sign-ins, MFA changes, and sensitive actions are logged for the organization.
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
