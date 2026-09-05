import { cookies } from "next/headers";

import { AppGates } from "@/components/app-gates";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { LogoutButton } from "@/components/logout-button";
import {
  ActiveWorkspaceLabel,
  MobileWorkspaceMenu,
} from "@/components/mobile-nav";
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
import { db } from "@/lib/db";
import { hashToken } from "@/lib/password";
import { eq } from "drizzle-orm";
import { impersonationSessions, users as usersTable, organizations as orgsTable } from "@/db/schema";

import { OPERATOR_RETURN_COOKIE } from "@/lib/impersonation";
import { needsMfaSetup, onboardingComplete } from "@/modules/org/policies";

/** Best-effort: identify the impersonation window for banner display. */
async function impersonationTarget(returnToken: string | null): Promise<boolean> {
  if (!returnToken) return false;
  try {
    const [row] = await db
      .select({ id: impersonationSessions.id })
      .from(impersonationSessions)
      .innerJoin(usersTable, eq(usersTable.id, impersonationSessions.operatorUserId))
      .innerJoin(orgsTable, eq(orgsTable.id, impersonationSessions.organizationId))
      .where(eq(impersonationSessions.operatorReturnTokenHash, hashToken(returnToken)))
      .limit(1);
    return !!row;
  } catch {
    return false;
  }
}

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
  // Phase E.2: an impersonation window parks the operator's return session in
  // this httpOnly cookie — its presence marks every page with the banner.
  const impersonating = await impersonationTarget((await cookies()).get(OPERATOR_RETURN_COOKIE)?.value ?? null);
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
      .map(({ href, label, badge, group }) => ({
        href,
        label,
        badge: badge ? badgeCounts[badge] : undefined,
        group,
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
    <div className="h-dvh">
      {impersonating ? (
        <ImpersonationBanner orgName={org.name} targetName={ctx.user.name} />
      ) : null}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>

      {/* sidebar — single source of navigation on desktop */}
      <div className="flex h-full">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-border-default bg-surface-subtle px-2.5 py-3 md:flex">
          <WorkspaceSidebar
            workspaces={shellWorkspaces}
            paletteNav={paletteNav}
            org={{
              name: org.name,
              primaryColor: org.primaryColor,
              logoUrl: org.logoUrl,
            }}
            user={{
              name: ctx.user.name,
              email: ctx.user.email,
              roleLabel: (ctx.roleNames ?? []).join(" · ") || "Member",
            }}
          />
        </aside>

        {/* content */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* mobile top bar: org brand + active workspace + menu disclosure */}
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border-default bg-surface px-4 py-3 md:hidden">
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

          <main
            id="main"
            className="mx-auto flex w-full min-h-0 min-w-0 max-w-5xl flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 has-[[data-fill-workspace]]:max-w-none has-[[data-fill-workspace]]:overflow-hidden has-[[data-fill-workspace]]:px-0 has-[[data-fill-workspace]]:py-0"
          >
            <AppGates
              mfaRequired={needsMfaSetup(ctx)}
              onboardingIncomplete={!onboardingComplete(org.onboardingState)}
            >
              {children}
            </AppGates>
          </main>
        </div>
      </div>
    </div>
  );
}
