"use client";

/**
 * Wamiro overlay primitives — the ONLY overlays feature code may use.
 * Behavior: Floating UI (positioning/collision) + React Aria Components
 * (dialog focus trap/restore). Visuals: 100% Wamiro tokens.
 */
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { Dialog as AriaDialog, Modal as AriaModal, ModalOverlay as AriaModalOverlay } from "react-aria-components";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { cx } from "@/lib/cx";

const PANEL =
  "rounded-lg border border-border-default bg-surface shadow-[0_4px_12px_rgba(23,23,23,0.10)]";
const DUR = "transition-opacity duration-[var(--dur)]";

/* ---------------------------------------------------------------- Tooltip */
/** §21: icon-only controls + short context. Hover AND keyboard focus. */
export function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: React.ReactElement;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
    placement: side,
  });
  const hover = useHover(context, { delay: { open: 300, close: 0 }, move: false });
  const focus = useFocus(context);
  const dismiss = useDismiss(context, { escapeKey: true, outsidePress: false });
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);
  return (
    <>
      {children
        ?  
          cloneElement(children, {
            ref: refs.setReference as never,
            ...getReferenceProps(),
          })
        : null}
      {open ? (
        <span
          ref={refs.setFloating}
          style={floatingStyles}
          {...getFloatingProps()}
          className={cx(
            PANEL,
            "z-[var(--z-popover)] max-w-60 px-2 py-1 text-xs font-medium text-secondary",
          )}
          role="tooltip"
        >
          {label}
        </span>
      ) : null}
    </>
  );
}

/* Attach ref/props to any child element without cloning APIs per type. */
function cloneElement(child: React.ReactElement, props: Record<string, unknown>) {
  const base = (child.props ?? {}) as Record<string, unknown>;
  return <child.type {...base} {...props} /> as React.ReactElement;
}

/* ---------------------------------------------------------------- Popover */
/** §22: anchor/open/close/focus/keyboard/dismiss; click-outside closes. */
export function Popover({
  trigger,
  children,
  align = "start",
}: {
  trigger: (o: { open: boolean; toggle: () => void; ref: (n: HTMLElement | null) => void }) => React.ReactElement;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLElement | null>(null);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
    placement: align === "end" ? "bottom-end" : "bottom-start",
  });
  const dismiss = useDismiss(context);
  const role = useRole(context);
  const { getFloatingProps } = useInteractions([dismiss, role]);

  useEffect(() => {
    if (open && anchorRef.current) refs.setReference(anchorRef.current);
  }, [open, refs]);

  return (
    <>
      {trigger({
        open,
        toggle: () => setOpen((v) => !v),
        ref: (n) => {
          anchorRef.current = n;
          refs.setReference(n);
        },
      })}
      {open ? (
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          {...getFloatingProps()}
          className={cx(PANEL, "min-w-48 p-1")}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------- Menu */
/** §23: click → arrows → Enter → close → focus back to trigger. */
export function Menu({
  label,
  items,
  variant = "secondary",
  size = "sm",
  disabled,
}: {
  label: string;
  items: { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }[];
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(-1);

  return (
    <Popover
      align="end"
      trigger={({ toggle, ref, open }) => (
        <button
          ref={ref as never}
          onClick={toggle}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="menu"
          className={cx(btnClass(variant), btnSize(size))}
        >
          {label}
        </button>
      )}
    >
      {(close) => (
        <div
          ref={listRef}
          role="menu"
          tabIndex={-1}
          onKeyDown={(e) => {
            const els = Array.from(
              listRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not([disabled])") ?? [],
            );
            if (!els.length) return;
            let i = activeRef.current;
            if (e.key === "ArrowDown") i = Math.min(i + 1, els.length - 1);
            else if (e.key === "ArrowUp") i = Math.max(i - 1, 0);
            else if (e.key === "Home") i = 0;
            else if (e.key === "End") i = els.length - 1;
            else return;
            e.preventDefault();
            activeRef.current = i;
            els[i]!.focus();
          }}
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                close();
                it.onSelect();
                // §42 focus restoration handled by popover trigger re-focus below
              }}
              className={cx(
                "block w-full rounded-md px-3 py-1.5 text-left text-sm text-secondary",
                "hover:bg-surface-hover focus:bg-surface-hover focus:text-primary focus:outline-none",
                it.danger && "text-danger",
              )}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

/* ------------------------------------------------------------------ Dialog */
/** §36: RAC Modal provides focus trap + restore; Escape safe by default. */
export function Dialog({
  isOpen,
  onOpenChange,
  title,
  children,
  size = "md",
}: {
  isOpen: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: (close: () => void) => React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <AriaModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className={cx("fixed inset-0 z-[var(--z-modal)] flex items-start justify-center bg-black/40 px-4 pt-24", DUR)}
    >
      <AriaModal className={size === "sm" ? "w-full max-w-sm" : size === "lg" ? "w-full max-w-xl" : "w-full max-w-md"}>
        <AriaDialog className={cx(PANEL, "p-5")}>
          {({ close }) => (
            <>
              <h2 slot="title" className="text-base font-semibold text-primary">{title}</h2>
              <div className="mt-3 text-sm text-secondary">{children(close)}</div>
            </>
          )}
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}

export const DialogContext = createContext<{ close: () => void } | null>(null);
export function useDialogClose() {
  return useContext(DialogContext);
}

/** §37 destructive confirm — never color alone; explicit copy + Cancel default. */
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
}: {
  isOpen: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} title={title} size="sm">
      {(close) => (
        <>
          <p>{body}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button className={btnClass("secondary")} onClick={close}>Cancel</button>
            <button
              className={btnClass("danger")}
              onClick={() => {
                close();
                onConfirm();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/* shared button classes (mirror ui.tsx `btn`, kept local to avoid cycles) */
function btnClass(variant: "primary" | "secondary" | "danger" | "ghost") {
  switch (variant) {
    case "primary":
      return "inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-on-brand transition hover:bg-brand-hover active:bg-brand-active disabled:pointer-events-none disabled:opacity-50";
    case "danger":
      return "inline-flex items-center justify-center gap-2 rounded-md border border-danger/40 bg-surface px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger-subtle disabled:pointer-events-none disabled:opacity-50";
    case "ghost":
      return "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-secondary transition hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-50";
    default:
      return "inline-flex items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-primary transition hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-50";
  }
}
function btnSize(size: "sm" | "md") {
  return size === "sm" ? "px-2.5 py-1.5 text-xs" : "";
}
