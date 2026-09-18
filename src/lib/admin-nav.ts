/**
 * Admin console IA (single source of truth for the admin sub-navigation).
 * Both the sidebar (workspaces.ts) and the per-page tab strips derive from
 * this list, so a page can never be reachable but unfindable.
 */
export interface AdminNavEntry {
  href: string;
  label: string;
  /** Short caption used on the console home tiles. */
  hint: string;
  /** any-of permission semantics, mirroring the shell's gating model. */
  permissions: string[];
  /** Optional module switch that must be enabled too. */
  module?: string;
}

export const ADMIN_NAV: AdminNavEntry[] = [
  {
    href: "/admin",
    label: "Overview",
    hint: "Health of the tenant at a glance: people, access, sessions and what needs a decision.",
    permissions: ["users.manage", "roles.manage", "audit.view"],
  },
  {
    href: "/admin/users",
    label: "Users",
    hint: "Invite people, assign roles, suspend access and grant temporary permissions.",
    permissions: ["users.manage", "roles.manage"],
  },
  {
    href: "/admin/roles",
    label: "Roles",
    hint: "Permission bundles. Open a role to inspect its grants and holders.",
    permissions: ["roles.manage"],
  },
  {
    href: "/admin/access-reviews",
    label: "Access reviews",
    hint: "Periodically confirm elevated roles and overrides are still justified.",
    permissions: ["roles.manage", "users.manage"],
  },
  {
    href: "/admin/security",
    label: "Security",
    hint: "MFA policy, sessions, password change requests and the security event feed.",
    permissions: ["users.manage"],
  },
  {
    href: "/admin/audit",
    label: "Audit log",
    hint: "Every administrative action, filterable by actor, action and search.",
    permissions: ["audit.view"],
  },
  {
    href: "/admin/organization",
    label: "Organization",
    hint: "Departments and audited CSV exports of your company data.",
    permissions: ["departments.manage", "data.export", "audit.view"],
  },
  {
    href: "/admin/storage",
    label: "Storage",
    hint: "Object storage usage by category for this workspace.",
    permissions: ["users.manage", "settings.manage"],
  },
  {
    href: "/admin/integrations",
    label: "Integrations",
    hint: "Signed webhooks, SAML/SSO and SCIM provisioning.",
    permissions: ["settings.manage"],
  },
  {
    href: "/admin/services",
    label: "Services",
    hint: "The service catalog employees can request; approval and ticketing options.",
    permissions: ["services.manage"],
    module: "tickets",
  },
  {
    href: "/admin/ticket-groups",
    label: "Ticket groups",
    hint: "Routing rules and teams that triage incoming support tickets.",
    permissions: ["tickets.manage"],
    module: "tickets",
  },
  {
    href: "/admin/mailboxes",
    label: "Mailboxes",
    hint: "Connect inboxes so incoming email becomes tickets automatically.",
    permissions: ["tickets.manage"],
    module: "tickets",
  },
];

/**
 * Tab-strip variant: the Overview entry is implied by the breadcrumb.
 * `modules` is the org's module switch record; entries whose module is
 * disabled never render, exactly like the sidebar gating.
 */
export function adminTabsFor(
  can: (permission: string) => boolean,
  modules: Record<string, boolean> | null | undefined,
): { href: string; label: string }[] {
  return ADMIN_NAV.filter(
    (e) =>
      (e.module ? modules?.[e.module] !== false : true) &&
      e.permissions.some((p) => can(p)),
  ).map(({ href, label }) => ({ href, label }));
}
