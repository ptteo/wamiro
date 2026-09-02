export const dynamic = "force-dynamic";

import Link from "next/link";

import { AdminKpi, AdminKpiStrip, AdminSection } from "@/components/admin-ui";
import { Badge, Card, EmptyState, btn } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { SECURITY_AUDIT_QUERY } from "@/lib/admin-security";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listOrgSessions, getAdminOverview } from "@/modules/admin/service";
import { SessionRevokeButton } from "@/components/admin-user-actions";
import { zammadConfig } from "@/modules/integrations/zammad";
import { frappeConfig } from "@/modules/integrations/frappe";

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

  const [overview, sessions, zammad, frappe] = await Promise.all([
    getAdminOverview(ctx),
    listOrgSessions(ctx),
    Promise.resolve(zammadConfig()),
    Promise.resolve(frappeConfig()),
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
      <p className="text-[11px] text-tertiary">
        Session revocation is audited. MFA is self-service at Settings → Security.
      </p>

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

      <AdminSection title="Authentication" subtitle="Tenant-wide policies (read-only in v1)">
        <ul className="divide-y divide-border-subtle text-sm">
          <li className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <span className="shrink-0 text-tertiary">Password policy</span>
            <span className="text-primary sm:text-right">Minimum 8 characters; scrypt hash with per-user salt.</span>
          </li>
          <li className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <span className="shrink-0 text-tertiary">Session timeout</span>
            <span className="text-primary sm:text-right">14 days, httpOnly + SameSite=Lax, SHA-256 token storage.</span>
          </li>
          <li className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <span className="shrink-0 text-tertiary">Login protection</span>
            <span className="text-primary sm:text-right">Per-email and per-IP rate limits on /auth/login.</span>
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
          <li className="flex items-center justify-between py-2.5">
            <span className="text-tertiary">SSO</span>
            <Badge tone="neutral">Not configured</Badge>
          </li>
        </ul>
      </AdminSection>

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
        title="Providers"
        subtitle="Optional adapters. Core product works without them."
        action={
          <Link
            href={`/admin/audit?action=${encodeURIComponent(SECURITY_AUDIT_QUERY)}`}
            className={`${btn.secondary} ${btn.small}`}
          >
            Security in audit
          </Link>
        }
      >
        <ul className="divide-y divide-border-subtle text-sm">
          <li className="flex items-center justify-between py-2.5">
            <span className="text-tertiary">Frappe HR</span>
            <Badge tone={frappe ? "green" : "neutral"}>{frappe ? "Configured" : "Not configured"}</Badge>
          </li>
          <li className="flex items-center justify-between py-2.5">
            <span className="text-tertiary">Zammad helpdesk</span>
            <Badge tone={zammad ? "green" : "neutral"}>{zammad ? "Configured" : "Not configured"}</Badge>
          </li>
        </ul>
      </AdminSection>
    </div>
  );
}

function shortUA(ua: string) {
  return ua.length > 60 ? ua.slice(0, 60) + "…" : ua;
}
