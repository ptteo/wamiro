"use client";

import { useState } from "react";
import { Calendar, ListTodo } from "lucide-react";

import { KanbanBoard } from "./kanban-board";
import { GanttChart } from "./gantt";
import { cx } from "@/lib/cx";

interface Task {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done" | string;
  priority: string;
  dueDate: string | null;
  assigneeName: string;
  loggedMinutes: number;
}
interface GanttTask {
  id: string;
  title: string;
  status: string;
  assigneeName: string;
  start: string;
  end: string;
}

type View = "board" | "timeline";

export function ProjectDetailTabs({
  tasks,
  ganttTasks,
}: {
  tasks: Task[];
  ganttTasks: GanttTask[];
}) {
  const [view, setView] = useState<View>("board");

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-md border border-border-subtle bg-surface p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setView("board")}
          aria-pressed={view === "board"}
          className={cx(
            "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium",
            view === "board" ? "bg-brand text-on-brand" : "text-tertiary hover:text-primary",
          )}
        >
          <ListTodo className="h-3.5 w-3.5" />
          Board · {tasks.length}
        </button>
        <button
          type="button"
          onClick={() => setView("timeline")}
          aria-pressed={view === "timeline"}
          className={cx(
            "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium",
            view === "timeline" ? "bg-brand text-on-brand" : "text-tertiary hover:text-primary",
          )}
        >
          <Calendar className="h-3.5 w-3.5" />
          Timeline · {ganttTasks.length}
        </button>
      </div>

      {view === "board" ? (
        <KanbanBoard
          tasks={tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status as "todo" | "in_progress" | "done",
            priority: t.priority,
            dueDate: t.dueDate,
            assigneeName: t.assigneeName,
            loggedMinutes: t.loggedMinutes,
          }))}
        />
      ) : (
        <GanttChart tasks={ganttTasks} />
      )}
    </div>
  );
}
