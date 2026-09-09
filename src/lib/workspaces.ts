import type { LucideIcon } from "lucide-react";

import type { ModuleKey } from "@/modules/iam/catalog";
import {
  Armchair,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  FileText,
  GraduationCap,
  History,
  FolderKanban,
  Gauge,
  Home,
  Inbox,
  Plug,
  LayoutDashboard,
  LifeBuoy,
  LineChart,
  ListChecks,
  ListTodo,
  ListTree,
  Megaphone,
  MessageSquare,
  Network,
  Package,
  PenLine,
  Rocket,
  Scale,
  ScrollText,
  Settings,
  Settings2,
  Shield,
  Sparkles,
  Star,
  Target,
  Trophy,
  Wand2,
  UserCog,
  UserPlus,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";

// ============================================================================
// D5 §6 — Centralized workspace configuration.
// The rail shows major product domains; the sidebar shows features inside
// whichever domain is selected. Data-driven so adding a module never requires
// touching the shell component.
//
// Gating model (mirrors the legacy flat nav exactly — UX only, APIs enforce
// authorization independently):
//   - Each SidebarItem carries its own module / permission / scope gates.
//     A workspace appears on the rail only when at least one of its sidebar
//     entries survives filtering (plus its own workspace-level gates below).
//   - `module`       → isModuleEnabled(org.modules, module)
//   - `permissions`  → ANY-of: viewer holds at least one listed permission
//   - `scope`        → widestScope(access, `of`) must be non-null, and when
//                      `in` is listed, must be one of those scopes
// ============================================================================

/** Numeric badge resolved by the shell into a live count. */
export type SidebarBadgeKey = "unread" | "approvals";

export interface SidebarItem {
  label: string;
  href: string;
  icon?: LucideIcon;
  /** Org module switch that must be enabled for this entry to render. */
  module?: ModuleKey;
  /** ANY-of permission gate — viewer must hold at least one, undenied. */
  permissions?: string[];
  /**
   * Scope-family gate: viewer must hold some permission starting with `of`;
   * when `in` is provided, the widest held scope must be one of them.
   */
  scope?: { of: string; in?: string[] };
  /** Badge count resolved server-side (unread notifications, open approvals). */
  badge?: SidebarBadgeKey;
  /** Optional sub-group label — rendered as a small caps header inside the expanded workspace section. */
  group?: string;
}

export interface WorkspaceDef {
  id: string;
  label: string;
  icon: LucideIcon;
  defaultRoute: string;
  /** Modules that must ALL be enabled for this workspace to appear. */
  requiredModules?: ModuleKey[];
  /** ANY-of permission gate for the whole workspace (in addition to items). */
  requiredPermissions?: string[];
  /** Sidebar links shown when this workspace is active */
  sidebar: SidebarItem[];
}

/**
 * Serializable nav model the shell passes to client islands (rail, sidebar,
 * mobile menu). Lucide components never cross the server→client boundary;
 * clients re-attach icons via WORKSPACES lookups by id/href.
 */
export interface ShellNavItem {
  href: string;
  label: string;
  badge?: number;
  group?: string;
}

export interface ShellNavWorkspace {
  id: string;
  label: string;
  /** Where the rail icon points — usually defaultRoute. */
  href: string;
  items: ShellNavItem[];
}

export const WORKSPACES: Record<string, WorkspaceDef> = {
  home: {
    id: "home",
    label: "Home",
    icon: Home,
    defaultRoute: "/home",
    sidebar: [
      { label: "Home", href: "/home", icon: Home },
      { label: "Notifications", href: "/notifications", icon: Bell, badge: "unread" },
      { label: "Favorites", href: "/favorites", icon: Star },
      { label: "Help", href: "/help", icon: CircleHelp },
    ],
  },
  support: {
    id: "support",
    label: "Support",
    icon: LifeBuoy,
    defaultRoute: "/tickets",
    requiredModules: ["tickets"],
    requiredPermissions: ["tickets.create"],
    sidebar: [
      { label: "My Tickets", href: "/tickets", icon: LifeBuoy, module: "tickets", permissions: ["tickets.create"] },
      {
        label: "SLA Dashboard",
        href: "/tickets/sla",
        icon: Gauge,
        module: "tickets",
        permissions: ["tickets.manage"],
      },
      {
        label: "Agent Toolkit",
        href: "/tickets/toolkit",
        icon: Wand2,
        module: "tickets",
        permissions: ["tickets.manage"],
      },
      {
        label: "Service Catalog",
        href: "/tickets/catalog",
        icon: Inbox,
        module: "tickets",
        permissions: ["tickets.create"],
      },
      {
        label: "Incidents & Changes",
        href: "/tickets/it-records",
        icon: ClipboardCheck,
        module: "tickets",
        permissions: ["tickets.manage"],
      },
    ],
  },
  people: {
    id: "people",
    label: "People",
    icon: Users,
    defaultRoute: "/people",
    sidebar: [
      { label: "Directory", href: "/people", icon: Users, module: "people", permissions: ["employees.view"], group: "Directory" },
      { label: "My Profile", href: "/people/me", icon: UserRound, group: "Directory" },
      { label: "Teams", href: "/teams", icon: Network, module: "teams", permissions: ["employees.view"], group: "Directory" },
      {
        label: "Org Chart",
        href: "/org-chart",
        icon: ListTree,
        module: "people",
        scope: { of: "employees.view", in: ["COMPANY", "GLOBAL"] },
        group: "Directory",
      },
      { label: "Attendance", href: "/attendance", icon: CalendarCheck, module: "attendance", permissions: ["attendance.view_self"], group: "Time & Attendance" },
      { label: "Attendance Corrections", href: "/attendance/corrections", icon: History, module: "attendance", permissions: ["attendance.view_self"], group: "Time & Attendance" },
      { label: "Shifts", href: "/shifts", icon: CalendarClock, module: "attendance", permissions: ["shifts.view"], group: "Time & Attendance" },
      {
        label: "Leave",
        href: "/leave",
        icon: CalendarDays,
        module: "leave",
        permissions: ["leave.apply", "leave.view_self"],
        group: "Leave",
      },
      {
        label: "Leave Encashment",
        href: "/leave/encashment",
        icon: Wallet,
        module: "leave",
        permissions: ["leave.apply", "leave.approve"],
        group: "Leave",
      },
      {
        label: "Payroll",
        href: "/payroll",
        icon: Wallet,
        permissions: ["payroll.view_self", "payroll.manage"],
        group: "Payroll",
      },
      {
        label: "Advances",
        href: "/payroll/advances",
        icon: Wallet,
        permissions: ["payroll.view_self", "payroll.manage"],
        group: "Payroll",
      },
      {
        label: "Performance",
        href: "/people/performance",
        icon: Trophy,
        permissions: ["performance.view_self", "performance.manage"],
        group: "People Ops",
      },
      {
        label: "Recognition",
        href: "/people/recognition",
        icon: Award,
        permissions: ["recognition.give"],
        group: "People Ops",
      },
      {
        label: "Recruitment",
        href: "/people/recruitment",
        icon: UserPlus,
        permissions: ["recruitment.manage"],
        group: "People Ops",
      },
      {
        label: "Learning",
        href: "/people/learning",
        icon: GraduationCap,
        permissions: ["learning.view", "learning.manage"],
        group: "People Ops",
      },
      {
        label: "Onboarding & Offboarding",
        href: "/people/lifecycle",
        icon: Rocket,
        permissions: ["lifecycle.manage"],
        group: "People Ops",
      },
    ],
  },
  work: {
    id: "work",
    label: "Work",
    icon: ListTodo,
    defaultRoute: "/my-work",
    sidebar: [
      { label: "My Work", href: "/my-work", icon: ListTodo, module: "work", permissions: ["tasks.view_self"] },
      { label: "Projects", href: "/projects", icon: FolderKanban, module: "work", permissions: ["projects.view"] },
      { label: "Goals", href: "/goals", icon: Target, module: "goals", permissions: ["employees.view"] },
      {
        label: "Calendar",
        href: "/calendar",
        icon: Calendar,
        module: "calendar",
        permissions: ["leave.view_self", "employees.view"],
      },
    ],
  },
  requests: {
    id: "requests",
    label: "Requests",
    icon: Inbox,
    defaultRoute: "/requests",
    sidebar: [
      { label: "My Requests", href: "/requests", icon: Inbox, module: "requests", permissions: ["requests.apply"] },
      {
        label: "Approvals",
        href: "/approvals",
        icon: CheckCircle2,
        permissions: ["requests.approve", "leave.approve"],
        badge: "approvals",
      },
    ],
  },
  knowledge: {
    id: "knowledge",
    label: "Knowledge",
    icon: BookOpen,
    defaultRoute: "/knowledge",
    // Phase 7 (§2.2): content lives together — Articles / Documents / HR Docs
    // in one workspace (Notion/Confluence convention). A workspace appears
    // only if at least one item survives gating, so orgs without the
    // documents module still see plain Knowledge.
    requiredModules: ["knowledge"],
    sidebar: [
      { label: "Articles", href: "/knowledge", icon: BookOpen, module: "knowledge", permissions: ["knowledge.view"], group: "Content" },
      { label: "Documents", href: "/documents", icon: FileText, module: "documents", permissions: ["documents.view"], group: "Content" },
      { label: "HR Documents", href: "/people/documents", icon: FileText, module: "people", permissions: ["documents.view"], group: "Content" },
    ],
  },
  company: {
    id: "company",
    label: "Company",
    icon: Building2,
    defaultRoute: "/announcements",
    sidebar: [
      { label: "Announcements", href: "/announcements", icon: Megaphone, module: "announcements" },
      { label: "Discussions", href: "/discussions", icon: MessageSquare, module: "announcements", permissions: ["employees.view"] },
      { label: "Surveys & Polls", href: "/surveys", icon: ListChecks, permissions: ["employees.view"] },
      { label: "Acknowledgements", href: "/acknowledgements", icon: PenLine, module: "announcements", permissions: ["employees.view"] },
    ],
  },
  facilities: {
    // Phase 7 (§2.2): Assets + Workplace merge into Facilities & IT
    // (Freshservice/Officevibe "physical ops" grouping).
    id: "facilities",
    label: "Facilities & IT",
    icon: Armchair,
    defaultRoute: "/workplace",
    sidebar: [
      { label: "Rooms & Bookings", href: "/workplace", icon: Armchair, module: "workplace", permissions: ["workplace.view", "workplace.book"], group: "Facilities" },
      { label: "Assets", href: "/assets", icon: Package, module: "assets", permissions: ["assets.view_self"], group: "IT & Equipment" },
    ],
  },
  finance: {
    id: "finance",
    label: "Finance",
    icon: LineChart,
    defaultRoute: "/finance",
    requiredModules: ["finance"],
    requiredPermissions: ["finance.view_self"],
    sidebar: [
      { label: "Finance Home", href: "/finance", icon: LayoutDashboard, module: "finance", permissions: ["finance.view_self"], group: "Self-Service" },
      { label: "Expenses", href: "/finance/expenses", icon: PenLine, module: "finance", permissions: ["finance.view_self"], group: "Self-Service" },
      { label: "Purchases", href: "/finance/purchases", icon: Package, module: "finance", permissions: ["finance.view_self"], group: "Self-Service" },
      { label: "Travel", href: "/finance/travel", icon: CalendarDays, module: "finance", permissions: ["finance.view_self"], group: "Self-Service" },
      { label: "Vendors", href: "/finance/vendors", icon: Building2, module: "finance", permissions: ["finance.manage_vendors"], group: "Company" },
      { label: "Budgets", href: "/finance/budgets", icon: Target, module: "finance", permissions: ["finance.view_company"], group: "Company" },
      { label: "Approvals", href: "/finance/approvals", icon: CheckCircle2, module: "finance", permissions: ["finance.approve"], group: "Company" },
    ],
  },
  analytics: {
    id: "analytics",
    label: "Analytics",
    icon: BarChart3,
    defaultRoute: "/analytics",
    requiredModules: ["analytics"],
    sidebar: [
      { label: "Analytics", href: "/analytics", icon: LineChart, module: "analytics", scope: { of: "analytics.view" } },
      { label: "People & HR", href: "/analytics/hr", icon: Users, module: "analytics", permissions: ["analytics.view_company"] },
      { label: "Support", href: "/analytics/support", icon: LifeBuoy, module: "analytics", permissions: ["tickets.sla_view"] },
      { label: "Dashboards", href: "/dashboards", icon: LayoutDashboard, module: "analytics", scope: { of: "analytics.view" } },
    ],
  },
  ai: {
    id: "ai",
    label: "AI",
    icon: Bot,
    defaultRoute: "/assistant",
    requiredModules: ["ai"],
    sidebar: [{ label: "Assistant", href: "/assistant", icon: Sparkles, module: "ai" }],
  },
  admin: {
    id: "admin",
    label: "Admin",
    icon: Settings,
    defaultRoute: "/admin",
    requiredModules: ["admin"],
    requiredPermissions: ["users.manage", "roles.manage", "audit.view"],
    sidebar: [
      {
        label: "Admin Console",
        href: "/admin",
        icon: Settings2,
        module: "admin",
        permissions: ["users.manage", "roles.manage", "audit.view"],
        group: "Console",
      },
      {
        // Phase 7 (§2.2): GRC is an admin function in BambooHR/LogicGate-class
        // tools — moved out of Company.
        label: "Governance",
        href: "/governance",
        icon: Scale,
        module: "governance",
        permissions: ["governance.view"],
        group: "GRC",
      },
      {
        label: "Users",
        href: "/admin/users",
        icon: UserCog,
        module: "admin",
        permissions: ["users.manage", "roles.manage", "audit.view"],
        group: "Access & Security",
      },
      {
        label: "Roles",
        href: "/admin/roles",
        icon: UserCog,
        module: "admin",
        permissions: ["roles.manage"],
        group: "Access & Security",
      },
      {
        label: "Security Center",
        href: "/admin/security",
        icon: Shield,
        module: "admin",
        permissions: ["users.manage"],
        group: "Access & Security",
      },
      {
        label: "Audit Log",
        href: "/admin/audit",
        icon: ScrollText,
        module: "admin",
        permissions: ["audit.view"],
        group: "Access & Security",
      },
      {
        label: "Access Reviews",
        href: "/admin/access-reviews",
        icon: ClipboardCheck,
        module: "admin",
        permissions: ["users.manage", "roles.manage", "audit.view"],
        group: "Access & Security",
      },
      {
        label: "Services",
        href: "/admin/services",
        icon: Package,
        module: "admin",
        permissions: ["services.manage"],
        group: "Support Settings",
      },
      {
        label: "Ticket Groups",
        href: "/admin/ticket-groups",
        icon: Network,
        module: "admin",
        permissions: ["tickets.manage"],
        group: "Support Settings",
      },
      {
        label: "Mailboxes",
        href: "/admin/mailboxes",
        icon: Inbox,
        module: "admin",
        permissions: ["tickets.manage"],
        group: "Support Settings",
      },
      {
        label: "Integrations",
        href: "/admin/integrations",
        icon: Plug,
        module: "admin",
        permissions: ["settings.manage"],
        group: "Enterprise",
      },
    ],
  },
};

/** Sidebar order — major mental models only (§3). */
export const RAIL_ORDER = [
  "home",
  "people",
  "work",
  "requests",
  "support",
  "knowledge",
  "company",
  "facilities",
  "finance",
  "analytics",
  "ai",
  "admin",
];

/** Platform console is separate — only for super admins. */
export const PLATFORM_WORKSPACE = {
  id: "platform",
  label: "Platform",
  icon: Shield,
  defaultRoute: "/platform",
};

/**
 * Best-match workspace for a pathname: among every candidate prefix (the
 * workspace's own href plus each sidebar item href) the LONGEST match wins,
 * so /admin/users resolves inside `admin`, not merely its parent. Returns
 * null when nothing matches — callers fall back to the home workspace.
 */
export function resolveWorkspaceId(
  pathname: string,
  workspaces: readonly ShellNavWorkspace[],
): string | null {
  let best: string | null = null;
  let bestLength = -1;
  for (const ws of workspaces) {
    const prefixes = [ws.href];
    for (const item of ws.items) prefixes.push(item.href);
    for (const base of prefixes) {
      const matches = pathname === base || pathname.startsWith(base + "/");
      if (matches && base.length > bestLength) {
        bestLength = base.length;
        best = ws.id;
      }
    }
  }
  return best;
}

/** Resolve the active workspace, falling back to `home` like the rail does. */
export function activeWorkspace(
  pathname: string,
  workspaces: readonly ShellNavWorkspace[],
): ShellNavWorkspace | null {
  const id = resolveWorkspaceId(pathname, workspaces) ?? "home";
  return workspaces.find((w) => w.id === id) ?? null;
}

/** Longest-prefix current item — `/admin/users` must not also light up `/admin`. */
export function sidebarItemCurrent(
  pathname: string,
  items: readonly { href: string }[],
  href: string,
): boolean {
  let best = "";
  for (const item of items) {
    const matches = pathname === item.href || pathname.startsWith(item.href + "/");
    if (matches && item.href.length > best.length) best = item.href;
  }
  return best === href;
}

export function sidebarIcon(workspaceId: string, href: string): LucideIcon | undefined {
  const ws = WORKSPACES[workspaceId];
  return ws?.sidebar.find((i) => i.href === href)?.icon ?? ws?.icon;
}
