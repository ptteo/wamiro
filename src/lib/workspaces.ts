import type { LucideIcon } from "lucide-react";

import type { ModuleKey } from "@/modules/iam/catalog";
import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Home,
  Inbox,
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
  ScrollText,
  Settings,
  Settings2,
  Shield,
  Sparkles,
  Target,
  UserCog,
  Users,
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
      { label: "Support", href: "/support", icon: LifeBuoy },
    ],
  },
  people: {
    id: "people",
    label: "People",
    icon: Users,
    defaultRoute: "/people",
    sidebar: [
      { label: "Directory", href: "/people", icon: Users, module: "people", permissions: ["employees.view"] },
      { label: "Teams", href: "/teams", icon: Network, module: "teams", permissions: ["employees.view"] },
      {
        label: "Org Chart",
        href: "/org-chart",
        icon: ListTree,
        module: "people",
        scope: { of: "employees.view", in: ["COMPANY", "GLOBAL"] },
      },
      { label: "Attendance", href: "/attendance", icon: CalendarCheck, module: "attendance", permissions: ["attendance.view_self"] },
      {
        label: "Leave",
        href: "/leave",
        icon: CalendarDays,
        module: "leave",
        permissions: ["leave.apply", "leave.view_self"],
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
    requiredModules: ["knowledge"],
    sidebar: [{ label: "All Articles", href: "/knowledge", icon: BookOpen, module: "knowledge", permissions: ["knowledge.view"] }],
  },
  documents: {
    id: "documents",
    label: "Documents",
    icon: FileText,
    defaultRoute: "/documents",
    requiredModules: ["documents"],
    sidebar: [{ label: "All Documents", href: "/documents", icon: FileText, module: "documents", permissions: ["documents.view"] }],
  },
  company: {
    id: "company",
    label: "Company",
    icon: Building2,
    defaultRoute: "/announcements",
    sidebar: [
      { label: "Announcements", href: "/announcements", icon: Megaphone, module: "announcements" },
      { label: "Discussions", href: "/discussions", icon: MessageSquare, module: "announcements", permissions: ["employees.view"] },
      { label: "Polls", href: "/surveys", icon: ListChecks, permissions: ["employees.view"] },
      { label: "Signatures", href: "/acknowledgements", icon: PenLine, module: "announcements", permissions: ["employees.view"] },
    ],
  },
  assets: {
    id: "assets",
    label: "Assets",
    icon: Package,
    defaultRoute: "/assets",
    requiredModules: ["assets"],
    sidebar: [{ label: "Assets", href: "/assets", icon: Package, module: "assets", permissions: ["assets.view_self"] }],
  },
  finance: {
    id: "finance",
    label: "Finance",
    icon: LineChart,
    defaultRoute: "/finance",
    requiredModules: ["finance"],
    requiredPermissions: ["finance.view_self"],
    sidebar: [
      { label: "Finance Home", href: "/finance", icon: LayoutDashboard, module: "finance", permissions: ["finance.view_self"] },
      { label: "Expenses", href: "/finance/expenses", icon: PenLine, module: "finance", permissions: ["finance.view_self"] },
      { label: "Purchases", href: "/finance/purchases", icon: Package, module: "finance", permissions: ["finance.view_self"] },
      { label: "Travel", href: "/finance/travel", icon: CalendarDays, module: "finance", permissions: ["finance.view_self"] },
      { label: "Vendors", href: "/finance/vendors", icon: Building2, module: "finance", permissions: ["finance.manage_vendors"] },
      { label: "Budgets", href: "/finance/budgets", icon: Target, module: "finance", permissions: ["finance.view_company"] },
      { label: "Approvals", href: "/finance/approvals", icon: CheckCircle2, module: "finance", permissions: ["finance.approve"] },
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
      },
      {
        label: "Access Control",
        href: "/admin/users",
        icon: UserCog,
        module: "admin",
        permissions: ["users.manage", "roles.manage", "audit.view"],
      },
      {
        label: "Roles",
        href: "/admin/roles",
        icon: UserCog,
        module: "admin",
        permissions: ["roles.manage"],
      },
      {
        label: "Security Center",
        href: "/admin/security",
        icon: Shield,
        module: "admin",
        permissions: ["users.manage"],
      },
      {
        label: "Audit Log",
        href: "/admin/audit",
        icon: ScrollText,
        module: "admin",
        permissions: ["audit.view"],
      },
      {
        label: "Access Reviews",
        href: "/admin/access-reviews",
        icon: ClipboardCheck,
        module: "admin",
        permissions: ["users.manage", "roles.manage", "audit.view"],
      },
    ],
  },
};

/** Rail order — major mental models only (§3). */
export const RAIL_ORDER = [
  "home",
  "people",
  "work",
  "requests",
  "knowledge",
  "documents",
  "company",
  "assets",
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
