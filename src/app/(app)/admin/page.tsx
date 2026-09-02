import Link from "next/link";

import { DepartmentsClient } from "@/components/departments-client";
import { HrSyncButton } from "@/components/hr-sync-button";
import { AdminKpi, AdminKpiStrip, AdminSection } from "@/components/admin-ui";
import { Badge, Card, EmptyState, btn } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { SECURITY_AUDIT_ACTIONS, SECURITY_AUDIT_QUERY } from "@/lib/admin-security";
import { requireAuthPage } from "@/lib/page-auth";
import { listDepartments } from "@/modules/org/service";
import { frappeConfig } from "@/modules/integrations/frappe";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import {
  getAdminOverview,
  listAuditLogs,
  listRolesWithCounts,
  listOrgSessions,
} from "@/modules/admin/service";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin" };

function Denied() {
  return (
    <>
      <PageHeader title="Admin" subtitle="You don't have administration permissions." />
      <Card>
        <EmptyState title="Admin area" hint="Ask an administrator if you need access." />
      </Card>
    </>
  );
}

export default async function AdminPage() {
  const ctx = await requireAuthPage();

  if (
    !isModuleEnabled(ctx.org.modules, "admin") ||
    (!can(ctx.access, "users.manage") &&
      !can(ctx.access, "roles.manage") &&
      !can(ctx.access, "audit.view"))
  ) {
    return <Denied />;
  }

  const overview = await getAdminOverview(ctx);
  const orgSessions = can(ctx.access, "users.manage") ? await listOrgSessions(ctx) : [];
  const liveSessions = orgSessions.filter((s) => !s.expired).length;

  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const [securityEvents, audits, orgRoles] = await Promise.all([
    can(ctx.access, "audit.view")
      ? listAuditLogs(ctx, {
          action: SECURITY_AUDIT_ACTIONS.join(","),
          since: since24h,
          limit: 10,
        })
      : Promise.resolve([]),
    can(ctx.access, "audit.view") ? listAuditLogs(ctx, { limit: 12 }) : Promise.resolve([]),
    can(ctx.access, "roles.manage") ? listRolesWithCounts(ctx) : Promise.resolve([]),
  ]);

  const attention: { label: string; detail: string; href: string; show: boolean }[] = [
    {
      label: "Suspended users",
      detail: `${overview.users.suspended} of ${overview.users.total} user${overview.users.total === 1 ? "" : "s"} are suspended.`,
      href: "/admin/users",
      show: overview.users.suspended > 0,
    },
    {
      label: "Expiring overrides",
      detail: `${overview.expiringOverrides} temporary permission grant${overview.expiringOverrides === 1 ? "" : "s"} expire within 7 days.`,
      href: "/admin/users",
      show: overview.expiringOverrides > 0,
    },
    {
      label: "Active override grants",
      detail: `${overview.activeOverrides} permission override${overview.activeOverrides === 1 ? "" : "s"} currently in effect.`,
      href: "/admin/users",
      show: overview.activeOverrides > 0,
    },
  ];
  const attentionOpen = attention.filter((a) => a.show);
  const mfaPct = overview.users.total
    ? Math.round((overview.users.mfaEnabled / overview.users.total) * 100)
    : 0;

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Admin"
        subtitle={`Users, roles, security and audit for ${ctx.org.name}.`}
      />

      <p className="text-[11px] text-tertiary">
        Tenant administration. Every invite, role change, override and export is audited.
      </p>

      <AdminKpiStrip>
          <AdminKpi
            label="Users"
            value={overview.users.total}
            hint={`${overview.users.active} active · ${overview.users.suspended} suspended`}
          />
          <AdminKpi
            label="MFA enrolled"
            value={`${mfaPct}%`}
            hint={`${overview.users.mfaEnabled} of ${overview.users.total}`}
            tone={mfaPct < 50 && overview.users.total > 0 ? "warning" : "success"}
          />
          <AdminKpi
            label="Live sessions"
            value={liveSessions}
            hint="Across the tenant"
          />
          <AdminKpi
            label="Overrides"
            value={overview.activeOverrides}
            hint={
              overview.expiringOverrides > 0
                ? `${overview.expiringOverrides} expire within 7 days`
                : `${overview.roles} roles in use`
            }
            tone={overview.expiringOverrides > 0 ? "warning" : "neutral"}
          />
      </AdminKpiStrip>

      <div className="flex flex-wrap gap-2">
        {can(ctx.access, "users.manage") ? (
          <Link href="/admin/users" className={`${btn.secondary} ${btn.small}`}>
            Access control
          </Link>
        ) : null}
        {can(ctx.access, "roles.manage") ? (
          <Link href="/admin/roles" className={`${btn.secondary} ${btn.small}`}>
            Roles
          </Link>
        ) : null}
        {can(ctx.access, "users.manage") ? (
          <Link href="/admin/security" className={`${btn.secondary} ${btn.small}`}>
            Security center
          </Link>
        ) : null}
        {can(ctx.access, "audit.view") ? (
          <Link href="/admin/audit" className={`${btn.secondary} ${btn.small}`}>
            Audit log
          </Link>
        ) : null}
        {can(ctx.access, "roles.manage") ? (
          <Link href="/admin/access-reviews" className={`${btn.secondary} ${btn.small}`}>
            Access reviews
          </Link>
        ) : null}
      </div>

      {attentionOpen.length > 0 ? (
        <AdminSection title="Attention required" subtitle="Things that need a decision" tone="warning">
          <ul className="divide-y divide-border-subtle">
            {attentionOpen.map((a) => (
              <li key={a.label} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-primary">{a.label}</p>
                  <p className="text-xs text-tertiary">{a.detail}</p>
                </div>
                <Link href={a.href} className={`${btn.secondary} ${btn.small} w-full sm:w-auto`}>
                  Review
                </Link>
              </li>
            ))}
          </ul>
        </AdminSection>
      ) : null}

      {securityEvents.length > 0 ? (
        <AdminSection
          title="Security events (24h)"
          subtitle="Suspensions, overrides, role changes, sessions"
          tone="danger"
          action={
            can(ctx.access, "audit.view") ? (
              <Link
                href={`/admin/audit?action=${encodeURIComponent(SECURITY_AUDIT_QUERY)}`}
                className={`${btn.secondary} ${btn.small}`}
              >
                Open audit
              </Link>
            ) : null
          }
        >
          <ul className="divide-y divide-border-subtle">
            {securityEvents.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
                <span className="font-mono text-xs text-primary">{e.action}</span>
                <span className="min-w-0 truncate text-xs text-tertiary">
                  {e.entityType}
                  {e.actorName ? ` · ${e.actorName}` : ""}
                </span>
                <span className="text-xs text-tertiary sm:ml-auto">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </AdminSection>
      ) : null}

      {can(ctx.access, "data.export") ? (
        <AdminSection title="Data export" subtitle="CSV downloads are audited" tone="brand">
          <div className="flex flex-wrap gap-2">
            {["employees", "attendance", "leave", "audit"].map((d) => (
              <a key={d} href={`/api/v1/admin/export/${d}`} className={`${btn.secondary} ${btn.small}`}>
                Export {d}
              </a>
            ))}
          </div>
        </AdminSection>
      ) : null}

      <AdminSection title="Integrations" subtitle="Frappe HR employee sync" tone="success">
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <span className="text-tertiary">
            {frappeConfig() ? "Frappe HR is configured." : "Frappe HR is not configured."}
          </span>
          <HrSyncButton configured={frappeConfig() !== null} />
        </div>
      </AdminSection>

      <DepartmentsClient
        departments={(await listDepartments(ctx)).map((d) => ({
          id: d.id,
          name: d.name,
          managerName: d.managerName,
          memberCount: Number(d.memberCount),
        }))}
        canManage={can(ctx.access, "departments.manage")}
      />

      {orgRoles.length > 0 ? (
        <AdminSection
          title="Roles in use"
          subtitle={`${orgRoles.length} bundle${orgRoles.length === 1 ? "" : "s"}`}
          action={
            can(ctx.access, "roles.manage") ? (
              <Link href="/admin/roles" className={`${btn.secondary} ${btn.small}`}>
                Manage
              </Link>
            ) : null
          }
        >
          <ul className="divide-y divide-border-subtle">
            {orgRoles.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <Link href={`/admin/roles/${r.id}`} className="min-w-0">
                  <p className="font-medium text-primary hover:underline">{r.name}</p>
                  {r.description ? <p className="truncate text-xs text-tertiary">{r.description}</p> : null}
                </Link>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge tone="neutral">
                    {r.members} member{r.members === 1 ? "" : "s"}
                  </Badge>
                  <Badge tone="brand">{r.key}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </AdminSection>
      ) : null}

      {audits.length > 0 ? (
        <AdminSection
          title="Recent activity"
          subtitle="Latest administrative actions"
          action={
            can(ctx.access, "audit.view") ? (
              <Link href="/admin/audit" className={`${btn.secondary} ${btn.small}`}>
                Open audit
              </Link>
            ) : null
          }
        >
          <ul className="divide-y divide-border-subtle">
            {audits.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
                <span className="font-mono text-xs">{a.action}</span>
                <span className="min-w-0 truncate text-xs text-tertiary">
                  {a.entityType}
                  {a.actorName ? ` · ${a.actorName}` : ""}
                </span>
                <span className="text-xs text-tertiary sm:ml-auto">
                  {new Date(a.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </AdminSection>
      ) : null}
    </div>
  );
}
