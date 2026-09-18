export const dynamic = "force-dynamic";

import Link from "next/link";

import { AdminKpi, AdminKpiStrip, AdminNav, AdminSection } from "@/components/admin-ui";
import { adminTabsFor } from "@/lib/admin-nav";
import { Badge, Card, EmptyState, btn } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { SECURITY_AUDIT_QUERY } from "@/lib/admin-security";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listOrgSessions, getAdminOverview } from "@/modules/admin/service";
import { listPasswordChangeRequests } from "@/modules/auth/passwords";
import { getPolicies } from "@/modules/org/policies";
import { SessionRevokeButton } from "@/components/admin-user-actions";
import { OrgPoliciesForm } from "@/components/org-policies-form";
import { PasswordRequestsAdmin } from "@/components/password-requests-admin";

export const metadata = { title: "Security center" };

export default async function SecurityCenterPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "admin") || !can(ctx.access, "users.manage")) {
    return (
      <>
        <PageHeader title="Security center" />
        <Card>
          <EmptyState title="Security center" hint="You don't have user management permissions." />
        </Card>
      </>
    );
  }

  const [overview, sessions, policies, passwordRequests] = await Promise.all([
    getAdminOverview(ctx),
    listOrgSessions(ctx),
    getPolicies(ctx),
    listPasswordChangeRequests(ctx),
  ]);

  const mfaPct = overview.users.total
    ? Math.round((overview.users.mfaEnabled / overview.users.total) * 100)
    : 0;
  const live = sessions.filter((s) => !s.expired);

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Security center"
        subtitle="Authentication, sessions, and provider status."
      />
      <AdminNav
        items={adminTabsFor(
          (p) => can(ctx.access, p),
          ctx.org.modules
        )}
      />

      <AdminKpiStrip columns={3}>
          <AdminKpi
            label="MFA enrolled"
            value={`${mfaPct}%`}
            hint={`${overview.users.mfaEnabled} of ${overview.users.total}`}
            tone={mfaPct < 50 && overview.users.total > 0 ? "warning" : "success"}
          />
          <AdminKpi label="Active sessions" value={live.length} hint="Not yet expired" />
          <AdminKpi
            label="Suspended users"
            value={overview.users.suspended}
            hint="Cannot sign in"
            tone={overview.users.suspended > 0 ? "warning" : "neutral"}
          />
      </AdminKpiStrip>

      <AdminSection title="Authentication" subtitle="Tenant-wide policies. Session timeout stays 14 days.">
        <OrgPoliciesForm
          allowedEmailDomains={policies.allowedEmailDomains ?? []}
          mfaMode={policies.mfaMode}
          passwordMode={policies.passwordMode}
        />
        <ul className="mt-4 divide-y divide-border-subtle text-sm">
          <li className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <span className="shrink-0 text-tertiary">Password strength</span>
            <span className="text-primary sm:text-right">Minimum 10 characters, letter + number; scrypt hash.</span>
          </li>
          <li className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <span className="shrink-0 text-tertiary">Lockout</span>
            <span className="text-primary sm:text-right">10 failed sign-ins in 15 minutes → 30-minute lock.</span>
          </li>
          <li className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <span className="shrink-0 text-tertiary">MFA</span>
            <span className="text-primary sm:text-right">
              TOTP (RFC 6238).{" "}
              <Link href="/settings/security" className="text-brand-text hover:underline">
                Settings → Security
              </Link>
            </span>
          </li>
        </ul>
      </AdminSection>

      <div id="password-requests" className="scroll-mt-24">
        <AdminSection title="Password change requests" subtitle="Only used when password mode is managed.">
          <PasswordRequestsAdmin
            requests={passwordRequests.map((r) => ({
              id: r.id,
              name: r.name,
              email: r.email,
              createdAt: r.createdAt.toISOString(),
            }))}
          />
        </AdminSection>
      </div>

      <AdminSection
        title="Sessions"
        subtitle="Active and recent sessions. Revocation is audited."
      >
        {sessions.length === 0 ? (
          <p className="py-4 text-sm text-tertiary">No sessions on record.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {sessions.slice(0, 50).map((s) => (
              <li key={s.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/admin/users/${s.userId}`} className="font-medium text-primary hover:underline">
                    {s.userName}
                  </Link>
                  <p className="break-all text-xs text-tertiary sm:truncate">
                    {s.userAgent ? shortUA(s.userAgent) : "Unknown device"}
                    {s.ip ? ` · ${s.ip}` : ""}
                    {" · "}created {new Date(s.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {s.expired ? <Badge tone="neutral">Expired</Badge> : <Badge tone="green">Active</Badge>}
                  {s.expired ? null : (
                    <SessionRevokeButton
                      userId={s.userId}
                      sessionId={s.id}
                      all={false}
                      className={`${btn.secondary} ${btn.small} ml-auto sm:ml-0`}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection
        title="Security events"
        subtitle="Security-relevant audit trail."
        action={
          <Link
            href={`/admin/audit?action=${encodeURIComponent(SECURITY_AUDIT_QUERY)}`}
            className={`${btn.secondary} ${btn.small}`}
          >
            Security in audit
          </Link>
        }
      >
        <p className="py-4 text-sm text-tertiary">
          Sign-ins, failed logins, session revocations, and security-relevant events are audited and
          exportable from the Audit Log.
        </p>
      </AdminSection>
    </div>
  );
}

function shortUA(ua: string) {
  return ua.length > 60 ? ua.slice(0, 60) + "…" : ua;
}
