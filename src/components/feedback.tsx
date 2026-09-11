"use client";

/**
 * Phase 6 §2 — feedback primitives for mutations.
 * - `usePendingAction`: wraps a fetch + router.refresh with a pending flag so
 *   every mutation button can show progress (no dead clicks) and toast
 *   success/error consistently.
 * - `OptimisticToggle`: instant-flip toggle (favorites, reactions, read-all…)
 *   with automatic rollback + error toast when the request fails.
 */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { toast } from "@/components/toaster";
import { cx } from "@/lib/cx";

export interface PendingActionOptions {
  /** Success toast message. Omit for silent success. */
  successMessage?: string;
  /** Called with the server's error message; override the default toast. */
  onError?: (message: string) => void;
  /** Skip the automatic router.refresh() after success. */
  skipRefresh?: boolean;
}

export interface PendingAction {
  run: (init: { url: string; method?: string; body?: unknown }) => Promise<boolean>;
  pending: boolean;
}

/**
 * Standard mutation flow: POST/PATCH/DELETE → parse the Wamiro error envelope
 * → toast on failure → router.refresh() on success.
 */
export function usePendingAction(options: PendingActionOptions = {}): PendingAction {
  const { successMessage, onError, skipRefresh } = options;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);

  const run = useCallback(
    async ({ url, method = "POST", body }: { url: string; method?: string; body?: unknown }) => {
      setPending(true);
      try {
        const res = await fetch(url, {
          method,
          headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          const message = data.error?.message ?? `Request failed (${res.status})`;
          if (onError) onError(message);
          else toast.error(message);
          return false;
        }
        if (successMessage) toast.success(successMessage);
        if (!skipRefresh) router.refresh();
        return true;
      } catch {
        const message = "Network error — check your connection and try again.";
        if (onError) onError(message);
        else toast.error(message);
        return false;
      } finally {
        if (mounted.current) setPending(false);
      }
    },
    [onError, router, skipRefresh, successMessage],
  );

  return { run, pending };
}

/* ---------------------------------------------------- optimistic toggle */

export interface OptimisticToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The mutation; throw/reject to roll back. */
  commit: (next: boolean) => Promise<void>;
  label?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Flip-first toggle: the UI updates immediately; if `commit` rejects the
 * visual state rolls back and an error toast explains why.
 */
export function OptimisticToggle({
  checked,
  onChange,
  commit,
  label,
  className,
  disabled,
}: OptimisticToggleProps) {
  const [on, setOn] = useState(checked);
  const [busy, setBusy] = useState(false);
  const synced = useRef(checked);
  synced.current = checked;

  async function handleClick() {
    if (busy || disabled) return;
    const next = !on;
    const prev = on;
    setOn(next); // optimistic
    onChange?.(next);
    setBusy(true);
    try {
      await commit(next);
    } catch (e) {
      setOn(prev); // rollback
      onChange?.(prev);
      toast.error((e as Error)?.message ?? "Couldn't save — change reverted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={handleClick}
      className={cx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        on ? "bg-brand" : "bg-border-strong",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span
        aria-hidden
        className={cx(
          "inline-block h-3.5 w-3.5 transform rounded-full bg-surface shadow transition-transform",
          on ? "translate-x-[19px]" : "translate-x-[3px]",
          busy && "opacity-90",
        )}
      />
    </button>
  );
}
