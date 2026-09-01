"use client";

import {
  Archive,
  CheckCircle2,
  History,
  Plus,
  UserPlus,
} from "lucide-react";

import { Avatar } from "./ui";
import { cx } from "@/lib/cx";

export interface ActivityItem {
  id: number;
  action: string;
  actorName: string | null;
  createdAt: string;
  newValue: Record<string, unknown> | null;
}

const ICON_FOR: Record<string, React.ReactNode> = {
  TASK_CREATED: <Plus className="h-3 w-3" />,
  TASK_STATUS_CHANGED: <CheckCircle2 className="h-3 w-3" />,
  PROJECT_CREATED: <Plus className="h-3 w-3" />,
  PROJECT_STATUS_CHANGED: <CheckCircle2 className="h-3 w-3" />,
  PROJECT_MEMBER_ADDED: <UserPlus className="h-3 w-3" />,
  PROJECT_MEMBER_REMOVED: <UserPlus className="h-3 w-3" />,
};

const TONE_FOR: Record<string, "brand" | "success" | "amber" | "danger" | "neutral"> = {
  TASK_CREATED: "brand",
  TASK_STATUS_CHANGED: "success",
  PROJECT_CREATED: "brand",
  PROJECT_STATUS_CHANGED: "success",
  PROJECT_MEMBER_ADDED: "amber",
  PROJECT_MEMBER_REMOVED: "danger",
};

function verbFor(action: string, newValue: Record<string, unknown> | null): string {
  if (action === "TASK_CREATED") return "created a task";
  if (action === "TASK_STATUS_CHANGED") {
    const s = (newValue?.["status"] as string | undefined) ?? "?";
    if (s === "done") return "completed a task";
    if (s === "in_progress") return "started a task";
    if (s === "todo") return "reopened a task";
    return `moved a task to ${s}`;
  }
  if (action === "PROJECT_CREATED") return "created the project";
  if (action === "PROJECT_STATUS_CHANGED") {
    const s = (newValue?.["status"] as string | undefined) ?? "?";
    return `set the project to ${s}`;
  }
  if (action === "PROJECT_MEMBER_ADDED") return "added a team member";
  if (action === "PROJECT_MEMBER_REMOVED") return "removed a team member";
  return action.toLowerCase().replace(/_/g, " ");
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const m = Math.floor((Date.now() - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ProjectActivity({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="px-5 py-8 text-center">
        <History className="mx-auto h-5 w-5 text-tertiary" />
        <p className="mt-1.5 text-xs text-tertiary">No activity yet — create a task or invite a member to get started.</p>
      </div>
    );
  }
  return (
    <ol className="relative space-y-3 pl-6 before:absolute before:bottom-1 before:left-2 before:top-1 before:w-px before:bg-border-subtle">
      {items.map((a) => {
        const tone = TONE_FOR[a.action] ?? "neutral";
        return (
          <li key={a.id} className="relative">
            <span
              className={cx(
                "absolute -left-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-surface",
                tone === "brand" && "bg-brand-subtle text-brand-text",
                tone === "success" && "bg-success-subtle text-success",
                tone === "amber" && "bg-warning-subtle text-warning",
                tone === "danger" && "bg-danger-subtle text-danger",
                tone === "neutral" && "bg-surface-subtle text-tertiary",
              )}
              aria-hidden
            >
              {ICON_FOR[a.action] ?? <Archive className="h-3 w-3" />}
            </span>
            <p className="text-sm text-primary">
              <span className="font-medium">{a.actorName ?? "Someone"}</span>{" "}
              <span className="text-tertiary">{verbFor(a.action, a.newValue)}</span>
            </p>
            <p className="text-[10px] tabular-nums text-tertiary" title={new Date(a.createdAt).toLocaleString()}>
              {relTime(a.createdAt)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
