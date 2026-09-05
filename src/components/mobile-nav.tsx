"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, ChevronDown, CreditCard, Shield } from "lucide-react";

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
  const [openSection, setOpenSection] = useState<string | null>(null);
  const activeId = activeWorkspace(pathname, workspaces)?.id ?? "home";

  // Opening one workspace section closes the others (single-open accordion).
  function toggleSection(id: string) {
    setOpenSection((cur) => (cur === id ? null : id));
  }

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
            const sectionOpen = openSection === ws.id;
            const oneChild = ws.items.length === 1 && ws.items[0];
            if (oneChild) {
              return (
                <Link
                  key={ws.id}
                  href={oneChild.href}
                  onClick={() => setOpen(false)}
                  className="mb-0.5 flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-primary transition hover:bg-surface-hover"
                >
                  {WsIcon ? <WsIcon className="h-3.5 w-3.5" strokeWidth={1.75} /> : null}
                  <span className="truncate">{ws.label}</span>
                </Link>
              );
            }
            return (
              <div key={ws.id} className="mb-0.5">
                <button
                  type="button"
                  aria-expanded={sectionOpen}
                  onClick={() => toggleSection(ws.id)}
                  className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-[13px] font-semibold text-primary transition hover:bg-surface-hover"
                >
                  {WsIcon ? <WsIcon className="h-3.5 w-3.5" strokeWidth={1.75} /> : null}
                  <span className="min-w-0 flex-1 truncate">{ws.label}</span>
                  <ChevronDown
                    className={cx("h-3.5 w-3.5 shrink-0 transition-transform", sectionOpen && "rotate-180")}
                    strokeWidth={1.75}
                  />
                </button>
                {sectionOpen ? (
                  <div className="mb-1 mt-0.5">
                    {ws.items.map((item) => {
                      const current =
                        ws.id === activeId && sidebarItemCurrent(pathname, ws.items, item.href);
                      return (
                        <Link
                          key={`${ws.id}-${item.href}`}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={current ? "page" : undefined}
                          className="flex h-8 items-center justify-between rounded-md px-2 pl-5 text-[13px] font-medium text-secondary transition hover:bg-surface-hover hover:text-primary aria-[current=page]:bg-brand-subtle aria-[current=page]:text-brand-text"
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
                ) : null}
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
            <Link
              href="/settings/billing"
              onClick={() => setOpen(false)}
              className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-secondary hover:bg-surface-hover hover:text-primary"
            >
              <CreditCard className="h-3.5 w-3.5" strokeWidth={1.75} />
              Plan & Billing
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
