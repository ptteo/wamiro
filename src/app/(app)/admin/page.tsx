import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { DepartmentsClient } from "@/components/departments-client";
import { HrSyncButton } from "@/components/hr-sync-button";
import { Badge, Card, CardHeader, EmptyState, btn } from "@/components/ui";
import { db } from "@/lib/db";
import { auditLogs, roles, users } from "@/db/schema";
import { requireAuthPage } from "@/lib/page-auth";
import { listDepartments } from "@/modules/org/service";
import { frappeConfig } from "@/modules/integrations/frappe";
import { can } from "@/modules/iam/engine";
import { getAdminOverview, listOrgSessions } from "@/modules/admin/service";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const ctx = await requireAuthPage();
  const orgId = ctx.user.organizationId;

  if (!can(ctx.access, "users.manage") && !can(ctx.access, "roles.manage") && !can(ctx.access, "audit.view")) {
    return (
      <Card>
        <EmptyState title="Admin area" hint="You don't have administration permissions." />
      </Card>
    );
  }

  // Single overview for the §4–5 Overview + Attention + Security + Access blocks.
  const overview = await getAdminOverview(ctx);

  // Org-level live sessions count for the Security block.
  const orgSessions = can(ctx.access, "users.manage")
    ? await listOrgSessions(ctx)
    : [];
  const liveSessions = orgSessions.filter((s) => !s.expired).length;

  // Recent audit: page query (joins actor name) used in the Activity block.
  const audits = can(ctx.access, "audit.view")
    ? await db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          actorName: users.name,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorUserId))
        .where(eq(auditLogs.organizationId, orgId))
        .orderBy(desc(auditLogs.id))
        .limit(15)
    : [];

  // Security-flavored events from the last 24h. We classify a few action
  // names as "security" so the strip never gets noisy with HR events.
  const SECURITY_ACTIONS = [
    "USER_SUSPENDED",
    "USER_REACTIVATED",
    "USER_INVITED",
    "PERMISSION_GRANTED",
    "PERMISSION_REVOKED",
    "SESSION_REVOKED",
    "MFA_ENABLED",
    "MFA_DISABLED",
    "LOGIN_FAILED",
    "PASSWORD_RESET",
    "ROLE_GRANTED",
    "ROLE_REVOKED",
  ];
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const securityEvents = can(ctx.access, "audit.view")
    ? await db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          actorName: users.name,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorUserId))
        .where(
          and(
            eq(auditLogs.organizationId, orgId),
            inArray(auditLogs.action, SECURITY_ACTIONS),
            sql`${auditLogs.createdAt} >= ${since24h.toISOString()}`,
          ),
        )
        .orderBy(desc(auditLogs.id))
        .limit(10)
    : [];

  // Roles in use list.
  const orgRoles = can(ctx.access, "roles.manage")
    ? await db
        .select({ id: roles.id, key: roles.key, name: roles.name, description: roles.description })
        .from(roles)
        .where(eq(roles.organizationId, orgId))
        .orderBy(desc(roles.createdAt))
    : [];

  // Attention items (§5) — actionable rows with deep links, not warning cards.
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
      href: "/admin/audit?action=PERMISSION_GRANTED",
      show: overview.expiringOverrides > 0,
    },
    {
      label: "Active override grants",
      detail: `${overview.activeOverrides} permission override${overview.activeOverrides === 1 ? "" : "s"} currently in effect.`,
      href: "/admin/audit?action=PERMISSION_GRANTED",
      show: overview.activeOverrides > 0,
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-primary">Administration</h1>
        <p className="mt-1 text-sm text-secondary">Users, roles, security and audit for {ctx.org.name}.</p>
      </header>

      {/* Overview (§4) — compact, no card grid */}
      <Card>
        <CardHeader title="Overview" subtitle="The organization's health at a glance." />
        <ul className="divide-y divide-border-subtle">
          <Row label="Users" value={`${overview.users.total} (${overview.users.active} active, ${overview.users.suspended} suspended)`} />
          <Row label="MFA adoption" value={`${overview.users.mfaEnabled} of ${overview.users.total} enabled`} />
          <Row label="Live sessions" value={`${liveSessions} across the tenant`} />
          <Row label="Roles" value={String(overview.roles)} />
          <Row label="Active overrides" value={String(overview.activeOverrides)} />
        </ul>
      </Card>

      {/* Security events (last 24h) — only when there is something to show */}
      {securityEvents.length > 0 ? (
        <Card>
          <CardHeader
            title="Security events (24h)"
            subtitle="Suspensions, overrides, role changes and session revocations."
            action={
              can(ctx.access, "audit.view") ? (
                <Link href="/admin/audit" className={`${btn.secondary} ${btn.small}`}>Open audit</Link>
              ) : null
            }
          />
          <ul className="divide-y divide-border-subtle">
            {securityEvents.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="font-mono text-xs text-primary">{e.action}</span>
                <span className="text-xs text-tertiary">
                  {e.entityType}
                  {e.actorName ? ` · ${e.actorName}` : ""}
                </span>
                <span className="ml-auto text-xs text-tertiary">{new Date(e.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Attention required (§5) — actionable list, not warning cards */}
      {attention.some((a) => a.show) ? (
        <Card>
          <CardHeader title="Attention required" />
          <ul className="divide-y divide-border-subtle">
            {attention
              .filter((a) => a.show)
              .map((a) => (
                <li key={a.label} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium">{a.label}</p>
                    <p className="text-xs text-tertiary">{a.detail}</p>
                  </div>
                  <Link href={a.href} className={`${btn.secondary} ${btn.small}`}>
                    Review
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      {/* Access control + data export + governance, kept as actionable rows */}
      {can(ctx.access, "users.manage") || can(ctx.access, "roles.manage") ? (
        <Card>
          <CardHeader title="Access control" subtitle="Manage users, roles and temporary permissions." />
          <div className="flex flex-wrap items-center gap-2 px-5 py-4">
            <Link href="/admin/users" className={btn.secondary}>Users</Link>
            {can(ctx.access, "roles.manage") ? <Link href="/admin/roles" className={btn.secondary}>Roles</Link> : null}
            {can(ctx.access, "audit.view") ? <Link href="/admin/audit" className={btn.secondary}>Audit log</Link> : null}
            <Link href="/admin/security" className={btn.secondary}>Security center</Link>
            {can(ctx.access, "roles.manage") ? <Link href="/admin/access-reviews" className={btn.secondary}>Access reviews</Link> : null}
          </div>
        </Card>
      ) : null}

      {can(ctx.access, "data.export") ? (
        <Card>
          <CardHeader title="Data export" subtitle="Download tenant data as CSV; every export is audited." />
          <div className="flex flex-wrap gap-2 px-5 py-4">
            {["employees", "attendance", "leave", "audit"].map((d) => (
              <a key={d} href={`/api/v1/admin/export/${d}`} className={`${btn.secondary} ${btn.small}`}>
                Export {d}
              </a>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Integrations */}
      <Card>
        <CardHeader title="Integrations" subtitle="Frappe HR sync and other provider connections." />
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
          <span className="text-tertiary">
            {frappeConfig() ? "Frappe HR: configured." : "Frappe HR: not configured."}
          </span>
          <HrSyncButton configured={frappeConfig() !== null} />
        </div>
      </Card>

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
        <Card>
          <CardHeader
            title="Roles in use"
            action={
              can(ctx.access, "roles.manage") ? (
                <Link href="/admin/roles" className={`${btn.secondary} ${btn.small}`}>Manage</Link>
              ) : null
            }
          />
          <ul className="divide-y divide-border-subtle">
            {orgRoles.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <Link href={`/admin/roles/${r.id}`} className="min-w-0">
                  <p className="font-medium hover:underline">{r.name}</p>
                  {r.description ? <p className="truncate text-xs text-tertiary">{r.description}</p> : null}
                </Link>
                <Badge tone="brand">{r.key}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {audits.length > 0 ? (
        <Card>
          <CardHeader
            title="Recent administrative activity"
            action={
              can(ctx.access, "audit.view") ? (
                <Link href="/admin/audit" className={`${btn.secondary} ${btn.small}`}>Open audit</Link>
              ) : null
            }
          />
          <ul className="divide-y divide-border-subtle">
            {audits.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="font-mono text-xs">{a.action}</span>
                <span className="text-xs text-tertiary">
                  {a.entityType}
                  {a.entityId ? ` · ${a.entityId}` : ""}
                  {a.actorName ? ` · ${a.actorName}` : ""}
                </span>
                <span className="ml-auto text-xs text-tertiary">{new Date(a.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
      <span className="text-tertiary">{label}</span>
      <span className="font-medium">{value}</span>
    </li>
  );
}
