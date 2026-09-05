/**
 * Permission catalog — the single source of truth for permission keys,
 * scopes, system roles and tenant modules.
 *
 * DB stores grants (role_permissions, user_permission_overrides) referencing
 * these keys; the engine in ./engine.ts is pure and testable.
 */

export const SCOPES = ["SELF", "TEAM", "DEPARTMENT", "COMPANY", "GLOBAL"] as const;
export type PermissionScope = (typeof SCOPES)[number];

/** Higher number = wider scope. Used only for filter-width resolution. */
export const SCOPE_RANK: Record<PermissionScope, number> = {
  SELF: 1,
  TEAM: 2,
  DEPARTMENT: 3,
  COMPANY: 4,
  GLOBAL: 5,
};

/**
 * Catalog grouped for admin UI + validation.
 * View permissions that differ per audience are spelled out per blueprint
 * (attendance.view_self vs attendance.view_team ...), not parameterised.
 */
export const PERMISSION_GROUPS: { group: string; permissions: string[] }[] = [
  {
    group: "People",
    permissions: [
      "employees.view",
      "employees.create",
      "employees.edit",
      "employees.delete",
      "employees.view_salary", // reserved — no salary fields yet
    ],
  },
  {
    group: "Finance",
    permissions: [
      "finance.view_self",
      "finance.view_company",
      "finance.submit",
      "finance.approve",
      "finance.reimburse",
      "finance.manage_vendors",
      "finance.manage_budgets",
      "finance.manage_procurement",
      "finance.export",
    ],
  },
  {
    group: "Payroll",
    permissions: ["payroll.view_self", "payroll.manage"],
  },
  {
    group: "People Ops",
    permissions: [
      "recruitment.manage",
      "lifecycle.manage",
      "performance.view_self",
      "performance.manage",
      "learning.view",
      "learning.manage",
      "recognition.give",
      "hr.change_manage",
    ],
  },
  {
    group: "Workplace",
    permissions: ["workplace.view", "workplace.book", "workplace.manage"],
  },
  {
    group: "Governance",
    permissions: ["governance.view", "governance.manage"],
  },
  {
    group: "Attendance",
    permissions: [
      "attendance.view_self",
      "attendance.view_team",
      "attendance.view_department",
      "attendance.view_company",
      "attendance.manage",
      "attendance.correct",
    ],
  },
  {
    group: "Shifts",
    permissions: ["shifts.view", "shifts.manage"],
  },
  {
    group: "Leave",
    permissions: [
      "leave.apply",
      "leave.view_self",
      "leave.view_team",
      "leave.view_department",
      "leave.approve",
      "leave.manage",
    ],
  },
  {
    group: "Requests",
    permissions: [
      "requests.apply",
      "requests.view_self",
      "requests.approve",
      "requests.manage",
    ],
  },
  {
    group: "Documents",
    permissions: ["documents.view", "documents.upload", "documents.manage"],
  },
  {
    group: "Knowledge",
    permissions: ["knowledge.view", "knowledge.manage"],
  },
  {
    group: "Goals",
    permissions: ["goals.view", "goals.manage"],
  },
  {
    group: "Tickets",
    permissions: ["tickets.create", "tickets.manage", "tickets.sla_view"],
  },
  {
    group: "Service Catalog",
    permissions: ["services.manage"],
  },
  {
    group: "Assets",
    permissions: ["assets.view_self", "assets.manage"],
  },
  {
    group: "Work",
    permissions: [
      "tasks.view_self",
      "tasks.create",
      "tasks.view_team",
      "projects.view",
      "projects.create",
      "projects.manage",
    ],
  },
  {
    group: "Analytics",
    permissions: [
      "analytics.view_self",
      "analytics.view_team",
      "analytics.view_department",
      "analytics.view_company",
    ],
  },
  {
    group: "Organization",
    permissions: [
      "departments.manage",
      "teams.manage",
      "announcements.manage", // reserved
    ],
  },
  {
    group: "Administration",
    permissions: [
      "users.manage",
      "roles.manage",
      "audit.view",
      "data.export",
      "settings.manage",
      "platform.admin",
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions);

/** Modules a tenant can enable/disable; drives nav, routes and APIs. */
export const MODULES = {
  people: "People directory",
  attendance: "Attendance",
  leave: "Leave",
  requests: "Request center",
  work: "Work & projects",
  teams: "Teams",
  calendar: "Calendar",
  goals: "Goals & OKRs",
  assets: "Asset inventory",
  tickets: "Support tickets",
  documents: "Documents",
  knowledge: "Knowledge base",
  analytics: "Analytics",
  ai: "AI assistant",
  announcements: "Announcements",
  finance: "Finance & procurement",
  workplace: "Workplace & rooms",
  governance: "Governance",
  admin: "Administration",
} as const;
export type ModuleKey = keyof typeof MODULES;

export function isModuleEnabled(
  modules: Record<string, boolean> | null | undefined,
  key: ModuleKey,
): boolean {
  return modules?.[key] !== false; // default-on unless explicitly disabled
}

// ---------- system role templates ----------
// Seeded into every new organization by provisionOrganization().

export interface SystemRoleTemplate {
  key: string;
  name: string;
  description: string;
  grants: readonly (readonly [permission: string, scope: PermissionScope])[];
}

const EMPLOYEE_BASE = [
  ["employees.view", "COMPANY"],
  ["attendance.view_self", "SELF"],
  ["shifts.view", "SELF"],
  ["payroll.view_self", "SELF"],
  ["leave.apply", "SELF"],
  ["leave.view_self", "SELF"],
  ["requests.apply", "SELF"],
  ["requests.view_self", "SELF"],
  ["documents.view", "COMPANY"],
  ["knowledge.view", "COMPANY"],
  ["tasks.view_self", "SELF"],
  ["tasks.create", "SELF"],
  ["projects.view", "COMPANY"],
  ["assets.view_self", "SELF"],
  ["goals.view", "COMPANY"],
  ["tickets.create", "SELF"],
  ["finance.view_self", "SELF"],
  ["finance.submit", "SELF"],
  ["performance.view_self", "SELF"],
  ["learning.view", "COMPANY"],
  ["recognition.give", "COMPANY"],
  ["workplace.view", "COMPANY"],
  ["workplace.book", "SELF"],
] as const;

export const SYSTEM_ROLES: readonly SystemRoleTemplate[] = [
  {
    key: "employee",
    name: "Employee",
    description: "Default role. Self-scoped access.",
    grants: EMPLOYEE_BASE,
  },
  {
    key: "manager",
    name: "Manager",
    description: "Team-scoped access plus approvals.",
    grants: [
      ...EMPLOYEE_BASE,
      ["attendance.view_team", "TEAM"],
      ["attendance.correct", "TEAM"],
      ["leave.view_team", "TEAM"],
      ["leave.approve", "TEAM"],
      ["requests.approve", "TEAM"],
      ["analytics.view_team", "TEAM"],
      ["tasks.view_team", "TEAM"],
      ["projects.create", "COMPANY"],
    ],
  },
  {
    key: "hr_admin",
    name: "HR Admin",
    description: "Company-wide people administration.",
    grants: [
      ...EMPLOYEE_BASE,
      ["employees.create", "COMPANY"],
      ["employees.edit", "COMPANY"],
      ["attendance.view_company", "COMPANY"],
      ["attendance.manage", "COMPANY"],
      ["attendance.correct", "COMPANY"],
      ["shifts.manage", "COMPANY"],
      ["payroll.manage", "COMPANY"],
      ["leave.view_department", "DEPARTMENT"],
      ["leave.approve", "COMPANY"],
      ["leave.manage", "COMPANY"],
      ["departments.manage", "COMPANY"],
      ["teams.manage", "COMPANY"],
      ["announcements.manage", "COMPANY"],
      ["requests.approve", "COMPANY"],
      ["requests.manage", "COMPANY"],
      ["documents.upload", "COMPANY"],
      ["documents.manage", "COMPANY"],
      ["knowledge.manage", "COMPANY"],
      ["goals.manage", "COMPANY"],
      ["analytics.view_company", "COMPANY"],
      ["projects.manage", "COMPANY"],
      ["assets.manage", "COMPANY"],
      ["tickets.manage", "COMPANY"],
      ["tickets.sla_view", "COMPANY"],
      ["services.manage", "COMPANY"],
      ["recruitment.manage", "COMPANY"],
      ["lifecycle.manage", "COMPANY"],
      ["performance.manage", "COMPANY"],
      ["learning.manage", "COMPANY"],
      ["hr.change_manage", "COMPANY"],
      ["workplace.manage", "COMPANY"],
      ["governance.manage", "COMPANY"],
      ["governance.view", "COMPANY"],
    ],
  },
  {
    key: "ceo",
    name: "CEO",
    description: "Broad business visibility. No secrets by default.",
    grants: [
      ...EMPLOYEE_BASE,
      ["attendance.view_company", "COMPANY"],
      ["leave.view_team", "COMPANY"],
      ["leave.approve", "COMPANY"],
      ["analytics.view_company", "COMPANY"],
      ["tickets.manage", "COMPANY"],
      ["tickets.sla_view", "COMPANY"],
    ],
  },
  {
    key: "admin",
    name: "Administrator",
    description: "Tenant administration: users, roles, settings, audit.",
    grants: [
      ...EMPLOYEE_BASE,
      ["users.manage", "COMPANY"],
      ["roles.manage", "COMPANY"],
      ["departments.manage", "COMPANY"],
      ["teams.manage", "COMPANY"],
      ["attendance.view_company", "COMPANY"],
      ["attendance.manage", "COMPANY"],
      ["attendance.correct", "COMPANY"],
      ["shifts.manage", "COMPANY"],
      ["payroll.manage", "COMPANY"],
      ["leave.approve", "COMPANY"],
      ["leave.manage", "COMPANY"],
      ["settings.manage", "COMPANY"],
      ["audit.view", "COMPANY"],
      ["announcements.manage", "COMPANY"],
      ["requests.approve", "COMPANY"],
      ["requests.manage", "COMPANY"],
      ["documents.upload", "COMPANY"],
      ["documents.manage", "COMPANY"],
      ["knowledge.manage", "COMPANY"],
      ["goals.manage", "COMPANY"],
      ["analytics.view_company", "COMPANY"],
      ["projects.manage", "COMPANY"],
      ["assets.manage", "COMPANY"],
      ["automations.manage", "COMPANY"],
      ["tickets.manage", "COMPANY"],
      ["tickets.sla_view", "COMPANY"],
      ["services.manage", "COMPANY"],
      ["finance.view_company", "COMPANY"],
      ["finance.approve", "COMPANY"],
      ["finance.reimburse", "COMPANY"],
      ["finance.manage_vendors", "COMPANY"],
      ["finance.manage_budgets", "COMPANY"],
      ["finance.manage_procurement", "COMPANY"],
      ["finance.export", "COMPANY"],
      ["recruitment.manage", "COMPANY"],
      ["lifecycle.manage", "COMPANY"],
      ["performance.manage", "COMPANY"],
      ["learning.manage", "COMPANY"],
      ["hr.change_manage", "COMPANY"],
      ["data.export", "COMPANY"],
      ["workplace.manage", "COMPANY"],
      ["governance.manage", "COMPANY"],
      ["governance.view", "COMPANY"],
    ],
  },
];

/** Platform Super Admin template (roles.organization_id IS NULL). */
export const PLATFORM_SUPER_ADMIN: SystemRoleTemplate = {
  key: "super_admin",
  name: "Platform Super Admin",
  description: "Full platform authority across tenants.",
  // tickets.manage lets the operator reply to platform-escalated support
  // tickets through the native ticket engine (first-response stamping works).
  grants: [["platform.admin", "GLOBAL"], ...EMPLOYEE_BASE, ["tickets.manage", "GLOBAL"], ["tickets.sla_view", "GLOBAL"]],
};
