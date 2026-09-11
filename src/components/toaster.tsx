"use client";

/**
 * Global toaster (Phase 6 §2). The ONLY toast surface feature code may use.
 * Usage:
 *   import { toast } from "@/components/toaster";
 *   toast.success("Saved");
 *   toast.error("Something broke");
 *   toast.undoable("Request withdrawn", async () => { await fetch(...) });
 *
 * Rendered once from the app shell; announcements go through a polite
 * aria-live region (assertive for errors). Reduced motion collapses slides.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

import { cx } from "@/lib/cx";

export type ToastTone = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  action?: ToastAction;
  /** ms before auto-dismiss; undefined = tone default; 0 = sticky until closed */
  duration?: number;
}

interface ToastContextValue {
  push: (t: Omit<ToastItem, "id">) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <Toaster>");
  return ctx;
}

const TONE_ICON: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={1.75} />,
  error: <AlertTriangle className="h-4 w-4 text-danger" strokeWidth={1.75} />,
  info: <Info className="h-4 w-4 text-secondary" strokeWidth={1.75} />,
};

const TONE_BORDER: Record<ToastTone, string> = {
  success: "border-success/30",
  error: "border-danger/40",
  info: "border-border-default",
};

const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 3500,
  info: 5000,
  error: 0, // errors stay until dismissed — don't punish slow readers
};

const MAX_STACK = 4;

export function Toaster({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((cur) => cur.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = nextId.current++;
      setItems((cur) => {
        const next = [...cur, { ...t, id }];
        // cap the stack — oldest info/success first, errors survive longest
        if (next.length > MAX_STACK) {
          const dropIdx = next.findIndex((x) => x.tone !== "error");
          const victim = dropIdx === -1 ? next[0] : next[dropIdx];
          if (victim) return next.filter((x) => x.id !== victim.id);
        }
        return next;
      });
      const duration = t.duration ?? DEFAULT_DURATION[t.tone];
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  const latest = items[items.length - 1];

  return (
    <ToastContext.Provider value={value}>
      <ToastEventBridge />
      {/* Page content MUST render through the provider — this was the blank-
       * screen regression when children were omitted here. */}
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--z-toast)] flex flex-col items-center gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-end sm:pr-6"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            aria-live={t.tone === "error" ? "assertive" : undefined}
            className={cx(
              "slide-fade pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-lg border bg-surface px-3.5 py-2.5 shadow-[0_8px_24px_rgba(16,24,40,0.12)]",
              "translate-y-0 opacity-100",
              TONE_BORDER[t.tone],
            )}
            style={{ animation: "enter-rise var(--dur) var(--ease) both" }}
          >
            <span className="mt-0.5 shrink-0">{TONE_ICON[t.tone]}</span>
            <p className="min-w-0 flex-1 text-sm leading-snug text-primary">{t.message}</p>
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  dismiss(t.id);
                  void Promise.resolve(t.action!.onClick()).catch(() => {
                    /* action failures surface through their own flow */
                  });
                }}
                className="shrink-0 rounded-md px-1.5 py-0.5 text-sm font-semibold text-brand-text transition hover:bg-brand-subtle"
              >
                {t.action.label}
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              className="-mr-1 mt-0.5 shrink-0 rounded-md p-1 text-tertiary transition hover:bg-surface-hover hover:text-primary"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
        ))}
        {/* keep an assertive channel alive for screen readers even when the
            visible stack is empty (e.g. single error already gone) */}
        <span className="sr-only" aria-live="assertive">
          {latest?.tone === "error" ? latest.message : ""}
        </span>
      </div>
    </ToastContext.Provider>
  );
}

/** Listens for the imperative `toast.*` shim events and surfaces them. */
function ToastEventBridge() {
  const { push } = useToast();
  useEffect(() => {
    function onEvent(e: Event) {
      const d = (e as CustomEvent).detail as {
        tone: ToastTone;
        message: string;
        action?: ToastAction;
        duration?: number;
      };
      if (!d || typeof d.message !== "string" || typeof d.tone !== "string") return;
      push({
        tone: d.tone as ToastTone,
        message: d.message,
        action: d.action,
        duration: typeof d.duration === "number" ? d.duration : undefined,
      });
    }
    window.addEventListener("wamiro:toast", onEvent);
    return () => window.removeEventListener("wamiro:toast", onEvent);
  }, [push]);
  return null;
}

/* ------------------------------------------------------------------ API */

function pushToast(tone: ToastTone, message: string, action?: ToastAction, duration?: number) {
  if (typeof window === "undefined") return;
  // The imperative shim rides a window event — keeps call sites free of
  // context wiring and works from anywhere (handlers, helpers, effects).
  window.dispatchEvent(
    new CustomEvent("wamiro:toast", { detail: { tone, message, action, duration } }),
  );
}

export const toast = {
  success: (message: string, duration?: number) => pushToast("success", message, undefined, duration),
  error: (message: string, duration?: number) => pushToast("error", message, undefined, duration),
  info: (message: string, duration?: number) => pushToast("info", message, undefined, duration),
  /** Success-style toast with an Undo action. `onUndo` runs once, on click. */
  undoable: (message: string, onUndo: () => void | Promise<void>) =>
    pushToast("success", message, { label: "Undo", onClick: onUndo }),
  /** Error with a retry affordance. */
  retryable: (message: string, onRetry: () => void | Promise<void>) =>
    pushToast("error", message, { label: "Retry", onClick: onRetry }),
};


