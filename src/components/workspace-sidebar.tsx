"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  CreditCard,
  History,
  LogOut,
  RotateCcw,
  Shield,
} from "lucide-react";

import { replayTour } from "@/components/product-tour";

import { CommandPalette } from "@/components/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { cx } from "@/lib/cx";
import {
  PLATFORM_WORKSPACE,
  WORKSPACES,
  resolveWorkspaceId,
  sidebarIcon,
  sidebarItemCurrent,
  type ShellNavWorkspace,
} from "@/lib/workspaces";

function workspaceIcon(id: string) {
  return WORKSPACES[id]?.icon ?? (id === PLATFORM_WORKSPACE.id ? PLATFORM_WORKSPACE.icon : null);
}

function SidebarLink({
  href,
  label,
  badge,
  current,
  icon,
}: {
  href: string;
  label: string;
  badge?: number;
  current: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cx(
        "flex h-8 items-center gap-2 rounded-md py-0 pl-2 pr-2 text-[13px] font-medium",
        current ? "bg-brand-subtle text-brand-text" : "text-secondary hover:bg-surface-hover hover:text-primary",
      )}
    >
      <span
        className={cx(
          "w-0.5 shrink-0 self-stretch rounded-full",
          current ? "bg-brand" : "bg-transparent",
        )}
        aria-hidden
      />
      {icon}
      <span className="min-w-0 truncate">{label}</span>
      {badge ? (
        <span
          key={badge}
          className="badge-pop ml-auto rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-on-brand"
        >
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

function OrgMark({ name, color, logoUrl }: { name: string; color: string; logoUrl: string | null }) {
  const [broken, setBroken] = useState(false);
  if (logoUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tenant logo from our API
      <img
        src="/api/v1/org/branding/logo"
        alt=""
        className="h-8 w-8 shrink-0 rounded-md object-cover"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[13px] font-bold text-white"
      style={{ background: color }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function WorkspaceSidebar({
  workspaces,
  paletteNav,
  org,
  user,
}: {
  workspaces: ShellNavWorkspace[];
  paletteNav: { href: string; label: string }[];
  org: { name: string; primaryColor: string; logoUrl: string | null };
  user: { name: string; email: string; roleLabel: string };
}) {
  const pathname = usePathname();
  const settings = pathname.startsWith("/settings/");
  const activeId = settings ? null : (resolveWorkspaceId(pathname, workspaces) ?? null);
  // Single-open accordion: exactly one workspace section is expanded at a time.
  // Opening another tab closes the previous one; navigating auto-opens the
  // workspace that owns the current page.
  const [openId, setOpenId] = useState<string | null>(() => activeId);

  useEffect(() => {
    if (activeId) setOpenId(activeId);
  }, [activeId]);

  function toggle(id: string) {
    setOpenId((cur) => (cur === id ? null : id));
  }

  return (
    <>
      <Link href="/home" className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-0.5 hover:bg-surface-hover">
        <OrgMark name={org.name} color={org.primaryColor} logoUrl={org.logoUrl} />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold tracking-tight text-primary">
            {org.name}
          </span>
        </span>
      </Link>

      <div className="mt-3">
        <CommandPalette nav={paletteNav} />
      </div>

      <nav aria-label="Modules" className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {workspaces.map((ws) => {
          const Icon = workspaceIcon(ws.id);
          const expanded = openId === ws.id;
          const inModule = ws.id === activeId;
          const oneChild = ws.items.length === 1 && ws.items[0];
          // Preserve group order as declared; items without a group render first.
          const groups: string[] = [];
          for (const item of ws.items) {
            if (item.group && !groups.includes(item.group)) groups.push(item.group);
          }
          return (
            <div key={ws.id} className="mb-0.5">
              {oneChild ? (
                <Link
                  href={oneChild.href}
                  aria-current={inModule ? "page" : undefined}
                  className={cx(
                    "flex h-9 items-center gap-2 rounded-md px-2 text-[13px] font-semibold",
                    inModule
                      ? "bg-brand-subtle text-brand-text"
                      : "text-primary hover:bg-surface-hover",
                  )}
                >
                  {Icon ? <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} /> : null}
                  <span className="min-w-0 truncate">{ws.label}</span>
                  {oneChild.badge ? (
                    <span className="ml-auto rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-on-brand">
                      {oneChild.badge > 9 ? "9+" : oneChild.badge}
                    </span>
                  ) : null}
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => toggle(ws.id)}
                    className={cx(
                      "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] font-semibold",
                      inModule
                        ? "bg-brand-subtle text-brand-text"
                        : "text-primary hover:bg-surface-hover",
                    )}
                  >
                    {Icon ? <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} /> : null}
                    <span className="min-w-0 flex-1 truncate">{ws.label}</span>
                    <ChevronDown
                      className={cx(
                        "h-3.5 w-3.5 shrink-0 text-tertiary transition",
                        expanded && "rotate-180",
                      )}
                      strokeWidth={1.75}
                    />
                  </button>
                  {expanded ? (
                    <div className="mb-1 mt-0.5">
                      {groups.map((group) => (
                        <div key={group}>
                          <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-tertiary">
                            {group}
                          </p>
                          <ul className="space-y-px">
                            {ws.items
                              .filter((item) => item.group === group)
                              .map((item) => {
                                const ItemIcon = sidebarIcon(ws.id, item.href);
                                const current = sidebarItemCurrent(pathname, ws.items, item.href);
                                return (
                                  <li key={item.href}>
                                    <SidebarLink
                                      href={item.href}
                                      label={item.label}
                                      badge={item.badge}
                                      current={current}
                                      icon={ItemIcon ? <ItemIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} /> : null}
                                    />
                                  </li>
                                );
                              })}
                          </ul>
                        </div>
                      ))}
                      {ws.items.filter((item) => !item.group).length > 0 ? (
                        <ul className="space-y-px">
                          {ws.items
                            .filter((item) => !item.group)
                            .map((item) => {
                              const ItemIcon = sidebarIcon(ws.id, item.href);
                              const current = sidebarItemCurrent(pathname, ws.items, item.href);
                              return (
                                <li key={item.href}>
                                  <SidebarLink
                                    href={item.href}
                                    label={item.label}
                                    badge={item.badge}
                                    current={current}
                                    icon={ItemIcon ? <ItemIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} /> : null}
                                  />
                                </li>
                              );
                            })}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </nav>

      <AccountMenu
        user={user}
        onOrg={pathname.startsWith("/settings/organization")}
        onSecurity={pathname.startsWith("/settings/security")}
        onActivity={pathname.startsWith("/settings/activity")}
        onBilling={pathname.startsWith("/settings/billing")}
      />
    </>
  );
}

function AccountMenu({
  user,
  onOrg,
  onSecurity,
  onActivity,
  onBilling,
}: {
  user: { name: string; email: string; roleLabel: string };
  onOrg: boolean;
  onSecurity: boolean;
  onActivity: boolean;
  onBilling: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      /* still leave */
    }
    window.location.href = "/login";
  }

  return (
    <div ref={rootRef} className="relative mt-auto shrink-0 border-t border-border-subtle pt-2">
      {open ? (
        <div
          role="menu"
          className="absolute inset-x-0 bottom-full z-20 mb-1 overflow-hidden rounded-lg border border-border-default bg-surface py-1 shadow-lg"
        >
          <p className="truncate px-3 py-2 text-[11px] text-tertiary" title={user.email}>
            {user.email}
          </p>
          <Link
            href="/help"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex h-9 items-center gap-2 px-3 text-[13px] font-medium text-primary hover:bg-surface-hover"
          >
            <CircleHelp className="h-4 w-4" strokeWidth={1.75} />
            Help
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              replayTour();
            }}
            className="flex h-9 w-full items-center gap-2 px-3 text-[13px] font-medium text-primary hover:bg-surface-hover"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
            Replay tour
          </button>
          <Link
            href="/settings/organization"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={cx(
              "flex h-9 items-center gap-2 px-3 text-[13px] font-medium",
              onOrg ? "bg-brand-subtle text-brand-text" : "text-primary hover:bg-surface-hover",
            )}
          >
            <Building2 className="h-4 w-4" strokeWidth={1.75} />
            Organization
          </Link>
          <Link
            href="/settings/security"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={cx(
              "flex h-9 items-center gap-2 px-3 text-[13px] font-medium",
              onSecurity ? "bg-brand-subtle text-brand-text" : "text-primary hover:bg-surface-hover",
            )}
          >
            <Shield className="h-4 w-4" strokeWidth={1.75} />
            Security
          </Link>
          <Link
            href="/settings/activity"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={cx(
              "flex h-9 items-center gap-2 px-3 text-[13px] font-medium",
              onActivity ? "bg-brand-subtle text-brand-text" : "text-primary hover:bg-surface-hover",
            )}
          >
            <History className="h-4 w-4" strokeWidth={1.75} />
            My activity
          </Link>
          <Link
            href="/settings/billing"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={cx(
              "flex h-9 items-center gap-2 px-3 text-[13px] font-medium",
              onBilling ? "bg-brand-subtle text-brand-text" : "text-primary hover:bg-surface-hover",
            )}
          >
            <CreditCard className="h-4 w-4" strokeWidth={1.75} />
            Plan & Billing
          </Link>
          <div className="px-1.5 py-1">
            <ThemeToggle showLabel />
          </div>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={logout}
            className="flex h-9 w-full items-center gap-2 px-3 text-[13px] font-medium text-danger hover:bg-danger-subtle disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-surface-hover",
          open && "bg-surface-hover",
          (onOrg || onSecurity) && "ring-1 ring-brand/30",
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-[11px] font-semibold text-brand-text">
          {initials(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-primary">{user.name}</span>
          <span className="block truncate text-[11px] text-brand-text">{user.roleLabel}</span>
        </span>
        <ChevronUp
          className={cx("h-3.5 w-3.5 shrink-0 text-tertiary transition", !open && "rotate-180")}
          strokeWidth={1.75}
        />
      </button>
    </div>
  );
}
