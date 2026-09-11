"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PLATFORM_WORKSPACE, WORKSPACES, sidebarItemCurrent } from "@/lib/workspaces";
import { cx } from "@/lib/cx";

function workspaceIcon(id: string) {
  return WORKSPACES[id]?.icon ?? (id === PLATFORM_WORKSPACE.id ? PLATFORM_WORKSPACE.icon : null);
}

/**
 * Phase 6 §7 — mobile bottom navigation: the first five visible workspaces as
 * icon tabs (44px+ touch targets), current tab highlighted via the same
 * longest-prefix rule as the desktop sidebar. Safe-area aware; hidden ≥ md.
 */
export function BottomNav({ workspaces }: { workspaces: { id: string; href: string }[] }) {
  const pathname = usePathname();
  const tabs = workspaces.slice(0, 5);
  if (tabs.length === 0) return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] flex border-t border-border-subtle bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {tabs.map((t) => {
        const Icon = workspaceIcon(t.id);
        const current = sidebarItemCurrent(pathname, [{ href: t.href }], t.href);
        const label = WORKSPACES[t.id]?.label ?? PLATFORM_WORKSPACE.label;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={current ? "page" : undefined}
            className={cx(
              "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition-colors",
              current ? "text-brand-text" : "text-tertiary hover:text-primary",
            )}
          >
            <span
              className={cx(
                "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                current && "bg-brand-subtle",
              )}
              aria-hidden
            >
              {Icon ? <Icon className="h-4 w-4" strokeWidth={1.75} /> : null}
            </span>
            <span className="max-w-full truncate px-0.5">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
