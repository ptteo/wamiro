export const dynamic = "force-dynamic";

import Link from "next/link";

import { Badge, Card, CardHeader, EmptyState, btn } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { listOrgSessions, getAdminOverview } from "@/modules/admin/service";
import { SessionRevokeButton } from "@/components/admin-user-actions";
import { zammadConfig } from "@/modules/integrations/zammad";
import { frappeConfig } from "@/modules/integrations/frappe";

export const metadata = { title: "Security center" };

export default async function SecurityCenterPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "users.manage")) {
    return (
      <Card>
        <EmptyState title="Security center" hint="You don't have user management permissions." />
      </Card>
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

  // Security events pulled from the audit trail. Heuristic: any action whose
  // token mentions login/mfa/session/password/role/permission/2fa.
  const securityEventActions = [
    "USER_SUSPENDED",
    "USER_REACTIVATED",
    "USER_INVITED",
    "ROLE_ASSIGNED",
    "ROLE_REMOVED",
    "PERMISSION_GRANTED",
    "PERMISSION_REVOKED",
    "PERMISSION_DENIED",
    "SESSION_REVOKED",
    "SESSIONS_REVOKED_ALL",
    "MFA_ENROLLED",
    "MFA_DISABLED",
  ];

  const sessionsUrl = `/admin/audit?action=${encodeURIComponent(securityEventActions.join(","))}`;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-primary">Security center</h1>
        <p className="mt-1 text-sm text-secondary">Authentication, sessions, and security events.</p>
      </header>

      <Card>
        <CardHeader title="Authentication settings" subtitle="Tenant-wide policies. Read-only in v1; change requests need a security review." />
        <ul className="divide-y divide-border-subtle text-sm">
          <li className="flex items-center justify-between px-5 py-2.5">
            <span className="text-tertiary">Password policy</span>
            <span>Minimum 8 characters; stored as scrypt hash with per-user salt.</span>
          </li>
          <li className="flex items-center justify-between px-5 py-2.5">
            <span className="text-tertiary">Session timeout</span>
            <span>14 days, httpOnly + SameSite=Lax cookie, SHA-256 token storage.</span>
          </li>
          <li className="flex items-center justify-between px-5 py-2.5">
            <span className="text-tertiary">Login protection</span>
            <span>Per-email + per-IP rate limits on <code className="font-mono text-xs">/auth/login</code>.</span>
          </li>
          <li className="flex items-center justify-between px-5 py-2.5">
            <span className="text-tertiary">MFA</span>
            <span>TOTP (RFC 6238). Self-service enrollment at <Link href="/settings/security" className="text-brand-text hover:underline">Settings → Security</Link>.</span>
          </li>
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="MFA adoption"
          subtitle="Use this to drive enrollment campaigns — a higher percentage is better."
        />
        <dl className="divide-y divide-border-subtle text-sm">
          <div className="flex items-center justify-between px-5 py-2.5">
            <dt className="text-tertiary">Enrolled</dt>
            <dd className="font-medium">{overview.users.mfaEnabled} of {overview.users.total} ({mfaPct}%)</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="SSO"
          subtitle="Single sign-on is not configured in v1. Future provider: TBD."
        />
        <ul className="divide-y divide-border-subtle text-sm">
          <li className="flex items-center justify-between px-5 py-2.5">
            <span className="text-tertiary">Provider</span>
            <Badge tone="neutral">Not configured</Badge>
          </li>
          <li className="flex items-center justify-between px-5 py-2.5">
            <span className="text-tertiary">Domain verification</span>
            <span>—</span>
          </li>
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Sessions"
          subtitle="Active and recent sessions across the tenant. Revocation is audited."
        />
        {sessions.length === 0 ? (
          <p className="px-5 py-4 text-sm text-tertiary">No sessions on record.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {sessions.slice(0, 50).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/admin/users/${s.userId}`} className="font-medium hover:underline">
                    {s.userName}
                  </Link>
                  <p className="truncate text-xs text-tertiary">
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
                      className={`${btn.secondary} ${btn.small}`}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Security events"
          subtitle="Authentication, role and permission changes, session revocations."
          action={
            <Link href={sessionsUrl} className={`${btn.secondary} ${btn.small}`}>
              Open in audit
            </Link>
          }
        />
        <p className="px-5 py-4 text-sm text-tertiary">
          Use the audit log to see the full history of security-relevant actions.
          {zammad || frappe ? " Provider connections are listed below." : ""}
        </p>
        <ul className="divide-y divide-border-subtle text-sm">
          <li className="flex items-center justify-between px-5 py-2.5">
            <span className="text-tertiary">Frappe HR</span>
            <Badge tone={frappe ? "green" : "neutral"}>{frappe ? "Configured" : "Not configured"}</Badge>
          </li>
          <li className="flex items-center justify-between px-5 py-2.5">
            <span className="text-tertiary">Zammad helpdesk</span>
            <Badge tone={zammad ? "green" : "neutral"}>{zammad ? "Configured" : "Not configured"}</Badge>
          </li>
        </ul>
      </Card>
    </div>
  );
}

function shortUA(ua: string) {
  return ua.length > 60 ? ua.slice(0, 60) + "…" : ua;
}
