"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, type LucideIcon } from "lucide-react";

import { cx } from "@/lib/cx";
import {
  PLATFORM_WORKSPACE,
  resolveWorkspaceId,
  WORKSPACES,
  type ShellNavWorkspace,
} from "@/lib/workspaces";

/** Icon lookup happens client-side so components never cross the RSC boundary. */
function railIcon(id: string): LucideIcon {
  return WORKSPACES[id]?.icon ?? (id === PLATFORM_WORKSPACE.id ? PLATFORM_WORKSPACE.icon : Home);
}

/**
 * D1 §17 rail: icon-only switching between major workspace areas.
 * Receives the viewer's visible workspaces from the shell (already filtered
 * by module + permission) and tracks the active one via the shared resolver,
 * so /approvals highlights Requests and /admin/users highlights Admin.
 */
export function AppRail({ items }: { items: ShellNavWorkspace[] }) {
  const pathname = usePathname();
  const activeId = resolveWorkspaceId(pathname, items) ?? "home";

  return (
    <aside
      aria-label="Workspace areas"
      className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col items-center gap-1 overflow-y-auto border-r border-border-default bg-surface py-4 md:flex lg:w-16"
    >
      {items.map(({ id, href, label }) => {
        const Icon = railIcon(id);
        const active = id === activeId;
        return (
          <Link
            key={id}
            href={href}
            title={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-secondary transition hover:bg-surface-hover hover:text-primary",
              active && "bg-brand-subtle text-brand-text",
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </Link>
        );
      })}
    </aside>
  );
}
