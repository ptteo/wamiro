import Link from "next/link";

import { AppRail } from "@/components/app-rail";
import { CommandPalette } from "@/components/command-palette";
import { LogoutButton } from "@/components/logout-button";
import {
  ActiveWorkspaceLabel,
  MobileWorkspaceMenu,
} from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { requireAuthPage } from "@/lib/page-auth";
import {
  PLATFORM_WORKSPACE,
  RAIL_ORDER,
  WORKSPACES,
  type ShellNavItem,
  type ShellNavWorkspace,
  type SidebarItem,
} from "@/lib/workspaces";
import { approvalCount } from "@/modules/home/service";
import { unreadCount } from "@/modules/notifications/service";
import { can, widestScope } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";

// every authenticated route is per-user dynamic — never prerendered at build
export const dynamic = "force-dynamic";

/**
 * The Company OS shell (D1 §16–18, D5 §6). The rail carries major workspace
 * switching; the sidebar shows contextual links for the active workspace.
 * Navigation is permission-aware (UX only — APIs enforce authorization
 * independently): each sidebar entry is gated by module + permission exactly
 * like the legacy flat nav, and a workspace only appears when the viewer can
 * see at least one of its entries.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuthPage();
  const org = ctx.org;
  const [unread, pendingApprovalsCount] = await Promise.all([
    unreadCount(ctx),
    can(ctx.access, "requests.approve") || can(ctx.access, "leave.approve")
      ? approvalCount(ctx)
      : Promise.resolve(0),
  ]);

  // ---- gate evaluation — identical predicates to the legacy flat nav ----

  function itemVisible(item: SidebarItem): boolean {
    if (item.module && !isModuleEnabled(org.modules, item.module)) return false;
    if (item.permissions && !item.permissions.some((p) => can(ctx.access, p))) return false;
    if (item.scope) {
      const scope = widestScope(ctx.access, item.scope.of);
      if (scope === null) return false;
      if (item.scope.in && !item.scope.in.includes(scope)) return false;
    }
    return true;
  }

  const badgeCounts: Record<"unread" | "approvals", number> = {
    unread,
    approvals: pendingApprovalsCount,
  };

  // ---- build the viewer's visible workspaces for rail + sidebar + mobile ----

  const shellWorkspaces: ShellNavWorkspace[] = [];
  for (const id of RAIL_ORDER) {
    const ws = WORKSPACES[id];
    if (!ws) continue;
    const modulesOk = (ws.requiredModules ?? []).every((m) =>
      isModuleEnabled(org.modules, m),
    );
    const requiredPerms = ws.requiredPermissions ?? [];
    const permsOk =
      requiredPerms.length === 0 || requiredPerms.some((p) => can(ctx.access, p));
    if (!modulesOk || !permsOk) continue;

    const items: ShellNavItem[] = ws.sidebar
      .filter(itemVisible)
      .map(({ href, label, badge }) => ({
        href,
        label,
        badge: badge ? badgeCounts[badge] : undefined,
      }));
    if (items.length === 0) continue; // nothing reachable inside → hide entirely

    shellWorkspaces.push({ id: ws.id, label: ws.label, href: ws.defaultRoute, items });
  }

  if (can(ctx.access, "platform.admin")) {
    shellWorkspaces.push({
      id: PLATFORM_WORKSPACE.id,
      label: PLATFORM_WORKSPACE.label,
      href: PLATFORM_WORKSPACE.defaultRoute,
      items: [{ href: "/platform", label: PLATFORM_WORKSPACE.label }],
    });
  }

  // flat list for the command palette — every destination still reachable via ⌘K
  const seen = new Set<string>();
  const paletteNav: { href: string; label: string }[] = [];
  for (const ws of shellWorkspaces) {
    for (const item of ws.items) {
      if (seen.has(item.href)) continue;
      seen.add(item.href);
      paletteNav.push({ href: item.href, label: item.label });
    }
  }

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>

      {/* fixed rail occupies this strip on desktop */}
      <div className="flex min-h-dvh md:pl-14 lg:pl-16">
        <AppRail items={shellWorkspaces} />

        {/* sidebar */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border-default bg-surface px-4 py-5 md:flex">
          <Link href="/home" className="mb-4 flex items-center gap-2.5 px-1">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ background: org.primaryColor }}
            >
              {org.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-primary">
                {org.name}
              </span>
              <span className="block text-[11px] text-tertiary">Powered by Wamiro</span>
            </span>
          </Link>
          <CommandPalette nav={paletteNav} />
          <WorkspaceSidebar workspaces={shellWorkspaces} />
          <div className="mt-auto pt-4">
            <div className="rounded-lg bg-surface-subtle px-3 py-2.5">
              <p className="truncate text-sm font-medium text-primary">{ctx.user.name}</p>
              {/* P0 role identity (R&D §12): active operating role always visible */}
              <p className="truncate text-[11px] font-semibold text-brand-text">
                {(ctx.roleNames ?? []).join(" · ") || "Member"}
              </p>
              <p className="truncate text-xs text-tertiary">{ctx.user.email}</p>
              <Link
                href="/settings/organization"
                className="mt-2 block w-full rounded-lg border border-border-default bg-surface px-3 py-1.5 text-center text-xs font-medium text-secondary transition hover:bg-surface-hover"
              >
                Organization
              </Link>
              <Link
                href="/settings/security"
                className="mt-2 block w-full rounded-lg border border-border-default bg-surface px-3 py-1.5 text-center text-xs font-medium text-secondary transition hover:bg-surface-hover"
              >
                Security
              </Link>
              <div className="mt-2 flex items-center gap-1.5">
                <ThemeToggle />
                <LogoutButton compact />
              </div>
            </div>
          </div>
        </aside>

        {/* content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* mobile top bar: org brand + active workspace + menu disclosure */}
          <header className="flex items-center justify-between gap-2 border-b border-border-default bg-surface px-4 py-3 md:hidden">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                style={{ background: org.primaryColor }}
              >
                {org.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-primary">
                  {org.name}
                </span>
                {/* P0: mobile users must also see who they are operating as */}
                <span className="block truncate text-[11px] font-semibold text-brand-text">
                  {ctx.user.name} · {(ctx.roleNames ?? []).join(" · ") || "Member"}
                </span>
                <ActiveWorkspaceLabel workspaces={shellWorkspaces} />
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <MobileWorkspaceMenu workspaces={shellWorkspaces} />
              <LogoutButton compact />
            </span>
          </header>

          <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
