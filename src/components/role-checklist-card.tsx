"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, ListChecks } from "lucide-react";

import type { RoleChecklist } from "@/modules/onboarding/checklists";
import { burstConfetti, shouldCelebrate } from "@/components/delight";
import { toast } from "@/components/toaster";
import { btn } from "./ui";

const PROGRESS_KEY = "wamiro-checklist-progress";

function readProgress(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

export function RoleChecklistCard({ checklists }: { checklists: RoleChecklist[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const visible = checklists.filter((c) => c.done < c.total);

  // Phase 6 §8 — checklist completion confetti: fires when the server-side
  // done count reaches total (remembered per browser so the moment isn't
  // cheapened by replays).
  const prevDone = useRef(readProgress());
  useEffect(() => {
    const progress = { ...prevDone.current };
    let changed = false;
    for (const c of checklists) {
      const wasComplete = (prevDone.current[c.role] ?? 0) >= c.total;
      if (c.done >= c.total && !wasComplete && c.total > 0) {
        if (shouldCelebrate(`checklist-complete-${c.role}`)) {
          burstConfetti();
          toast.success(
            c.role === "manager"
              ? "Manager checklist complete — nice work!"
              : "Checklist complete — you're all set!",
          );
        }
      }
      if (progress[c.role] !== c.done) {
        progress[c.role] = c.done;
        changed = true;
      }
    }
    if (changed) {
      prevDone.current = progress;
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
      } catch {
        /* noop */
      }
    }
  }, [checklists]);

  async function dismiss(role: RoleChecklist["role"]) {
    setBusy(role);
    try {
      const res = await fetch("/api/v1/me/preferences");
      const d = res.ok ? ((await res.json()) as { preferences?: { roleChecklist?: Record<string, unknown> } }) : {};
      const prev = (d.preferences?.roleChecklist as { dismissed?: Record<string, string> }) ?? {};
      await fetch("/api/v1/me/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "roleChecklist",
          orgScoped: true,
          value: { ...prev, dismissed: { ...prev.dismissed, [role]: new Date().toISOString() } },
        }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3" data-tour="home-next">
      {visible.map((c, i) => (
        <section
          key={c.role}
          className="stagger-enter rounded-xl border border-border-default bg-surface p-4 sm:p-5"
          style={{ "--stagger-i": i } as React.CSSProperties}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
                <ListChecks className="h-4 w-4 text-brand" strokeWidth={1.75} />
                {c.role === "manager" ? "Manager start" : "Your first steps"}
                <span className="font-medium text-tertiary">
                  · {c.done} of {c.total}
                </span>
              </h2>
              <p className="mt-0.5 text-xs text-tertiary">
                {c.role === "manager"
                  ? "Invite your team and approve one leave so people see you in the loop."
                  : "Clock in, then try a leave request — that’s the whole first day."}
              </p>
            </div>
            <button
              type="button"
              className={`${btn.secondary} ${btn.small}`}
              disabled={busy === c.role}
              onClick={() => void dismiss(c.role)}
            >
              Dismiss
            </button>
          </div>
          <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {c.steps.map((step) => (
              <li key={step.key}>
                <Link
                  href={step.href}
                  className="flex items-center gap-2.5 rounded-lg border border-border-subtle px-3 py-2 text-sm transition hover:border-brand/40 hover:bg-surface-hover"
                >
                  <span
                    className={[
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                      step.done ? "bg-success-subtle text-success" : "bg-surface-subtle text-tertiary",
                    ].join(" ")}
                    aria-hidden
                  >
                    {step.done ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
                  </span>
                  <span className={step.done ? "text-tertiary line-through" : "text-primary"}>{step.label}</span>
                  <ChevronRight className="ml-auto h-3.5 w-3.5 text-tertiary" strokeWidth={1.75} />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
