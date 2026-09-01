"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, CardHeader, EmptyState, btn } from "./ui";

interface Card {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: string;
  dueDate: string | null;
  assigneeName: string;
  loggedMinutes: number;
}

const COLUMNS: { key: Card["status"]; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
];

const PRIORITY_TONE = { high: "red", medium: "amber", low: "neutral" } as const;

export function KanbanBoard({ tasks }: { tasks: Card[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggingId, setLoggingId] = useState<string | null>(null);

  async function move(task: Card, dir: -1 | 1) {
    const order: Card["status"][] = ["todo", "in_progress", "done"];
    const next = order[order.indexOf(task.status) + dir];
    if (!next) return;
    setBusy(`m-${task.id}`);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Move failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function log(task: Card, minutes: number) {
    setBusy(`t-${task.id}`);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tasks/${task.id}/time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not log time");
        return;
      }
      setLoggingId(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const cards = tasks.filter((t) => t.status === col.key);
        return (
          <Card key={col.key}>
            <CardHeader title={`${col.label} (${cards.length})`} />
            {cards.length === 0 ? (
              <EmptyState title="Empty" />
            ) : (
              <ul className="space-y-2 p-2">
                {cards.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-lg border border-[var(--color-line)] bg-surface p-2.5 text-sm"
                  >
                    <p className="font-medium text-[var(--color-ink)]">{t.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone={PRIORITY_TONE[t.priority as keyof typeof PRIORITY_TONE] ?? "neutral"}>
                        {t.priority}
                      </Badge>
                      {t.dueDate && (
                        <span className="text-[10px] text-[var(--color-muted)]">{t.dueDate}</span>
                      )}
                      {(t.loggedMinutes ?? 0) > 0 && (
                        <span className="text-[10px] text-success">
                          {Math.round(t.loggedMinutes / 60 * 10) / 10}h logged
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-1">
                      <span className="truncate text-[10px] text-[var(--color-muted)]">
                        {t.assigneeName}
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          aria-label="Move left"
                          disabled={busy !== null || col.key === "todo"}
                          onClick={() => move(t, -1)}
                          className="rounded border border-[var(--color-line)] px-1.5 text-xs hover:bg-surface-hover"
                        >
                          ◀
                        </button>
                        <button
                          type="button"
                          aria-label="Log time"
                          onClick={() => setLoggingId(loggingId === t.id ? null : t.id)}
                          className="rounded border border-[var(--color-line)] px-1.5 text-[10px] font-medium hover:bg-surface-hover"
                        >
                          +h
                        </button>
                        <button
                          type="button"
                          aria-label="Move right"
                          disabled={busy !== null || col.key === "done"}
                          onClick={() => move(t, 1)}
                          className="rounded border border-[var(--color-line)] px-1.5 text-xs hover:bg-surface-hover"
                        >
                          ▶
                        </button>
                      </div>
                    </div>
                    {loggingId === t.id && (
                      <form
                        className="mt-2 flex items-center gap-1.5"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          await log(t, Number(f.get("minutes")));
                        }}
                      >
                        <input
                          type="number"
                          name="minutes"
                          min={1}
                          max={1440}
                          placeholder="min"
                          required
                          className="w-20 rounded-lg border border-[var(--color-line)] px-2 py-1 text-xs"
                        />
                        <button type="submit" disabled={busy !== null} className={`${btn.primary} ${btn.small}`}>
                          Log
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
      {error && (
        <p role="alert" className="md:col-span-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
