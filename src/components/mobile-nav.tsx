"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, ChevronDown, Shield } from "lucide-react";

import { cx } from "@/lib/cx";
import {
  activeWorkspace,
  PLATFORM_WORKSPACE,
  WORKSPACES,
  sidebarItemCurrent,
  type ShellNavWorkspace,
} from "@/lib/workspaces";

/** Current workspace name for the compact mobile top bar. */
export function ActiveWorkspaceLabel({ workspaces }: { workspaces: ShellNavWorkspace[] }) {
  const pathname = usePathname();
  const label = activeWorkspace(pathname, workspaces)?.label ?? "Home";
  return <span className="block truncate text-[11px] text-tertiary">{label}</span>;
}

function workspaceIcon(id: string) {
  return WORKSPACES[id]?.icon ?? (id === PLATFORM_WORKSPACE.id ? PLATFORM_WORKSPACE.icon : null);
}

/**
 * Mobile (< md) navigation: a "Menu" disclosure listing every visible
 * workspace with its filtered entries, replacing the old all-links chip strip.
 * Plain state toggle — no new dependencies.
 */
export function MobileWorkspaceMenu({ workspaces }: { workspaces: ShellNavWorkspace[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const activeId = activeWorkspace(pathname, workspaces)?.id ?? "home";

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cx(
          "flex h-8 items-center gap-1 rounded-lg border border-border-default bg-surface px-2.5 text-xs font-medium text-secondary transition hover:bg-surface-hover hover:text-primary",
          open && "bg-surface-hover text-primary",
        )}
      >
        Menu
        <ChevronDown
          className={cx("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
          strokeWidth={1.75}
        />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 max-h-[70dvh] w-64 overflow-y-auto rounded-xl border border-border-default bg-surface p-2 shadow-xl">
          {workspaces.map((ws) => {
            const WsIcon = workspaceIcon(ws.id);
            return (
              <div key={ws.id} className="mb-1 last:mb-0">
                <p className="flex items-center gap-1.5 px-2 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-tertiary">
                  {WsIcon ? <WsIcon className="h-3.5 w-3.5" strokeWidth={1.75} /> : null}
                  {ws.label}
                </p>
                {ws.items.map((item) => {
                  const current =
                    ws.id === activeId && sidebarItemCurrent(pathname, ws.items, item.href);
                  return (
                    <Link
                      key={`${ws.id}-${item.href}`}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={current ? "page" : undefined}
                      className="flex h-8 items-center justify-between rounded-md px-2 text-[13px] font-medium text-secondary transition hover:bg-surface-hover hover:text-primary aria-[current=page]:bg-brand-subtle aria-[current=page]:text-brand-text"
                    >
                      <span className="truncate">{item.label}</span>
                      {item.badge ? (
                        <span className="ml-2 shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {item.badge > 9 ? "9+" : item.badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            );
          })}
          <div className="mt-1 border-t border-border-subtle pt-1">
            <Link
              href="/settings/organization"
              onClick={() => setOpen(false)}
              className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-secondary hover:bg-surface-hover hover:text-primary"
            >
              <Building2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Organization
            </Link>
            <Link
              href="/settings/security"
              onClick={() => setOpen(false)}
              className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-secondary hover:bg-surface-hover hover:text-primary"
            >
              <Shield className="h-3.5 w-3.5" strokeWidth={1.75} />
              Security
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
