"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "@/lib/cx";
import {
  activeWorkspace,
  sidebarIcon,
  type ShellNavWorkspace,
} from "@/lib/workspaces";

/**
 * Contextual sidebar body (D5 §6): shows the entries of whichever workspace
 * best matches the current pathname, falling back to Home. Items arrive
 * pre-filtered by module + permission from the shell; this component only
 * resolves which workspace is active and mirrors aria-current per link.
 */
export function WorkspaceSidebar({ workspaces }: { workspaces: ShellNavWorkspace[] }) {
  const pathname = usePathname();
  const active = activeWorkspace(pathname, workspaces);

  return (
    <nav aria-label="Workspace sections" className="mt-3 flex-1 space-y-0.5">
      {active ? (
        <>
          <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-tertiary">
            {active.label}
          </p>
          {active.items.map((item) => {
            const Icon = sidebarIcon(active.id, item.href);
            const current =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className="flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium text-secondary transition hover:bg-surface-hover hover:text-primary aria-[current=page]:bg-brand-subtle aria-[current=page]:text-brand-text"
              >
                {Icon ? (
                  <Icon
                    className={cx("h-4 w-4 shrink-0", current ? "opacity-100" : "opacity-70")}
                    strokeWidth={1.75}
                  />
                ) : null}
                <span className="truncate">{item.label}</span>
                {item.badge ? (
                  <span className="ml-auto rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </>
      ) : null}
    </nav>
  );
}
