export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  ClipboardCheck,
  ScrollText,
  Shield,
  UserCog,
  Users,
  Plug,
  Package,
  Inbox,
  Network,
  Building2,
  HardDrive,
} from "lucide-react";

import { AdminAttentionRow, AdminKpi, AdminKpiStrip, AdminNav, AdminSection, AdminTile } from "@/components/admin-ui";
import { Badge, Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { DepartmentsClient } from "@/components/departments-client";
import { SECURITY_AUDIT_ACTIONS, SECURITY_AUDIT_QUERY } from "@/lib/admin-security";
import { adminTabsFor } from "@/lib/admin-nav";
import { requireAuthPage } from "@/lib/page-auth";
import { listDepartments } from "@/modules/org/service";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import {
  getAdminOverview,
  listAuditLogs,
  listRolesWithCounts,
  listOrgSessions,
} from "@/modules/admin/service";
import { listPasswordChangeRequests } from "@/modules/auth/passwords";

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

  const tabs = adminTabsFor((p) => can(ctx.access, p), ctx.org.modules);
  const overview = await getAdminOverview(ctx);
  const orgSessions = can(ctx.access, "users.manage") ? await listOrgSessions(ctx) : [];
  const liveSessions = orgSessions.filter((s) => !s.expired).length;

  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const [securityEvents, audits, orgRoles] = await Promise.all([
    can(ctx.access, "audit.view")
      ? listAuditLogs(ctx, {
          action: SECURITY_AUDIT_ACTIONS.join(","),
          since: since24h,
          limit: 8,
        })
      : Promise.resolve([]),
    can(ctx.access, "audit.view") ? listAuditLogs(ctx, { limit: 8 }) : Promise.resolve([]),
    can(ctx.access, "roles.manage") ? listRolesWithCounts(ctx) : Promise.resolve([]),
  ]);

  const pendingPasswordRequests = can(ctx.access, "users.manage")
    ? (await listPasswordChangeRequests(ctx)).length
    : 0;

  // G-26 — departments are rendered further down; fetch them with the other
  // data instead of an inline `await` inside the JSX tree.
  const departments = can(ctx.access, "departments.manage") || can(ctx.access, "data.export") || can(ctx.access, "audit.view")
    ? await listDepartments(ctx)
    : [];

  const attention: { label: string; detail: string; href: string; show: boolean }[] = [
    {
      label: "Password change requests",
      detail:
        pendingPasswordRequests === 1
          ? "1 user is waiting for approval to change their password (managed mode)."
          : `${pendingPasswordRequests} users are waiting for approval to change their password (managed mode).`,
      href: "/admin/security#password-requests",
      show: pendingPasswordRequests > 0,
    },
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
      label: "Active overrides",
      detail: `${overview.activeOverrides} permission override${overview.activeOverrides === 1 ? "" : "s"} currently in effect.`,
      href: "/admin/access-reviews",
      show: overview.activeOverrides > 0,
    },
  ];
  const attentionOpen = attention.filter((a) => a.show);
  const mfaPct = overview.users.total
    ? Math.round((overview.users.mfaEnabled / overview.users.total) * 100)
    : 0;

  const customRoles = orgRoles.filter((r) => !r.isSystem).length;

  const tiles: {
    href: string;
    icon: typeof Users;
    label: string;
    hint: string;
    count?: number;
    countLabel?: string;
    tone?: "neutral" | "warning" | "danger" | "brand" | "success";
    show: boolean;
  }[] = [
    {
      href: "/admin/users",
      icon: Users,
      label: "Users",
      hint: "Invite people, assign roles, suspend access, grant temporary permissions.",
      count: overview.users.suspended,
      countLabel: overview.users.suspended === 1 ? "suspended" : "suspended",
      tone: overview.users.suspended > 0 ? "warning" : "neutral",
      show: can(ctx.access, "users.manage") || can(ctx.access, "roles.manage"),
    },
    {
      href: "/admin/roles",
      icon: UserCog,
      label: "Roles",
      hint: "Permission bundles with holders and scopes.",
      count: orgRoles.length,
      tone: "neutral",
      show: can(ctx.access, "roles.manage"),
    },
    {
      href: "/admin/access-reviews",
      icon: ClipboardCheck,
      label: "Access reviews",
      hint: "Confirm elevated roles and overrides are still justified.",
      count: overview.activeOverrides,
      countLabel: "active",
      tone: overview.expiringOverrides > 0 ? "warning" : "neutral",
      show: can(ctx.access, "roles.manage") || can(ctx.access, "users.manage"),
    },
    {
      href: "/admin/security",
      icon: Shield,
      label: "Security",
      hint: "MFA policy, sessions and password change requests.",
      count: liveSessions,
      countLabel: "live sessions",
      tone: mfaPct < 50 && overview.users.total > 0 ? "warning" : "neutral",
      show: can(ctx.access, "users.manage"),
    },
    {
      href: "/admin/audit",
      icon: ScrollText,
      label: "Audit log",
      hint: "Every administrative action, filterable and exportable.",
      show: can(ctx.access, "audit.view"),
    },
    {
      href: "/admin/organization",
      icon: Building2,
      label: "Organization",
      hint: "Departments and audited CSV exports.",
      show:
        can(ctx.access, "departments.manage") ||
        can(ctx.access, "data.export") ||
        can(ctx.access, "audit.view"),
    },
    {
      href: "/admin/storage",
      icon: HardDrive,
      label: "Storage",
      hint: "Object storage usage by category.",
      show: can(ctx.access, "users.manage") || can(ctx.access, "settings.manage"),
    },
    {
      href: "/admin/integrations",
      icon: Plug,
      label: "Integrations",
      hint: "Webhooks, SSO and SCIM provisioning.",
      show: can(ctx.access, "settings.manage"),
    },
    {
      href: "/admin/services",
      icon: Package,
      label: "Services",
      hint: "The catalog employees can request.",
      show: isModuleEnabled(ctx.org.modules, "tickets") && can(ctx.access, "services.manage"),
    },
    {
      href: "/admin/ticket-groups",
      icon: Network,
      label: "Ticket groups",
      hint: "Routing rules and triage teams.",
      show: isModuleEnabled(ctx.org.modules, "tickets") && can(ctx.access, "tickets.manage"),
    },
    {
      href: "/admin/mailboxes",
      icon: Inbox,
      label: "Mailboxes",
      hint: "Email-to-ticket inboxes.",
      show: isModuleEnabled(ctx.org.modules, "tickets") && can(ctx.access, "tickets.manage"),
    },
  ];
  const visibleTiles = tiles.filter((t) => t.show);

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Admin"
        subtitle={`Users, roles, security and audit for ${ctx.org.name}.`}
      />

      <AdminNav items={tabs} />

      <AdminKpiStrip>
        <AdminKpi
          label="Users"
          value={overview.users.total}
          hint={`${overview.users.active} active · ${overview.users.suspended} suspended`}
          href="/admin/users"
        />
        <AdminKpi
          label="MFA enrolled"
          value={`${mfaPct}%`}
          hint={`${overview.users.mfaEnabled} of ${overview.users.total}`}
          tone={mfaPct < 50 && overview.users.total > 0 ? "warning" : "success"}
          href="/admin/security"
        />
        <AdminKpi
          label="Live sessions"
          value={liveSessions}
          hint="Across the tenant"
          href="/admin/security"
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
          href="/admin/access-reviews"
        />
      </AdminKpiStrip>

      {attentionOpen.length > 0 ? (
        <AdminSection title="Attention required" subtitle="Things that need a decision" tone="warning">
          <ul className="divide-y divide-border-subtle">
            {attentionOpen.map((a) => (
              <AdminAttentionRow
                key={a.label}
                title={a.label}
                detail={a.detail}
                action={
                  <Link href={a.href} className="text-sm font-medium text-brand-text hover:underline">
                    Review →
                  </Link>
                }
              />
            ))}
          </ul>
        </AdminSection>
      ) : null}

      <AdminSection title="Where do you want to go?" subtitle="Everything in the console, one click away">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTiles.map((t) => (
            <AdminTile
              key={t.href}
              href={t.href}
              icon={t.icon}
              label={t.label}
              hint={t.hint}
              count={t.count}
              countLabel={t.countLabel}
              tone={t.tone}
            />
          ))}
        </div>
      </AdminSection>

      {securityEvents.length > 0 ? (
        <AdminSection
          title="Security events (24h)"
          subtitle="Suspensions, overrides, role changes, sessions"
          tone="danger"
          action={
            can(ctx.access, "audit.view") ? (
              <Link
                href={`/admin/audit?action=${encodeURIComponent(SECURITY_AUDIT_QUERY)}`}
                className="text-sm font-medium text-brand-text hover:underline"
              >
                Open audit →
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

      {can(ctx.access, "departments.manage") ||
      can(ctx.access, "data.export") ||
      can(ctx.access, "audit.view") ? (
        <AdminSection
          title="Organization"
          subtitle="Departments and data exports"
          action={
            <Link href="/admin/organization" className="text-sm font-medium text-brand-text hover:underline">
              Open →
            </Link>
          }
        >
          <DepartmentsClient
            departments={departments.map((d) => ({
              id: d.id,
              name: d.name,
              managerName: d.managerName,
              memberCount: Number(d.memberCount),
            }))}
            canManage={can(ctx.access, "departments.manage")}
          />
        </AdminSection>
      ) : null}

      {orgRoles.length > 0 && can(ctx.access, "roles.manage") ? (
        <AdminSection
          title="Roles in use"
          subtitle={`${orgRoles.length} bundle${orgRoles.length === 1 ? "" : "s"}${customRoles > 0 ? ` · ${customRoles} custom` : ""}`}
          action={
            <Link href="/admin/roles" className="text-sm font-medium text-brand-text hover:underline">
              Manage →
            </Link>
          }
        >
          <ul className="divide-y divide-border-subtle">
            {orgRoles.slice(0, 8).map((r) => (
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
              <Link href="/admin/audit" className="text-sm font-medium text-brand-text hover:underline">
                Open audit →
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
