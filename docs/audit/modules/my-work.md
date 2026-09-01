# Module Excellence Checklist — My Work

Program: module-by-module industry-grade upgrade. Competitor grounding:
Linear (single-pane inbox, type icons, group by status), Height (per-row
priority dot + status button), Notion (per-row project chip + date
relative), Todoist (priority-based sort), Asana (today / upcoming /
later grouping), ClickUp (stat strip with clickable filter chips).
Research note: web-search was unavailable; patterns drawn from
established product knowledge of these 2025 task-management experiences.

## Already present (before this round)

- `listMyTasks` — the user's own tasks, ordered by status then due date
- `listTeamTasks` — direct reports' open tasks (gated by `tasks.view_team`)
- `listProjects` — org projects
- `createTask` / `updateTaskStatus` — full create + cycle status
- `loggedMinutesByTask` — per-task time log rollup
- 3 statuses (todo / in_progress / done) + 3 priorities (low / medium / high)

## Improved this round (m14 r12 — work redesign)

The old page was a single column of four stacked Cards (overdue if any,
open, team, completed) with a bare quick-add at the top. Filtering
was impossible, there was no stats strip, and the task rows were
generic text with no priority or project chip. This round rebuilds
the page with proper visual hierarchy, a stat strip, and bucket
grouping by due date.

### Layout

```
┌───────────────────────────────────────────────────────────────┐
│  My Work                                                       │
│  Your tasks across all projects.                              │
│                                                               │
│  ┌──── 4-col stats strip (gap-px) ──────────────┐           │
│  │ OPEN 4 │ DUE TODAY 2 │ OVERDUE 1 │ COMPLETED 27│           │
│  └────────────────────────────────────────────────────────────┘│
│                                                               │
│  ➕ [Add a task and press Enter  ] [Personal ▾] [Med ▾] [📅]   │
│                                                               │
│  🔍 Search tasks…  [Open] [Active] [Done] [All]  [All][High] │
│                                                               │
│  ── OVERDUE 1 ──                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ ⓘ ● Wire up the SSO test tenant  Engineering · 2d overdue│    │
│  │                                                     [high]│
│  │ ⓘ ● Set up KPI dashboard         Marketing · 1d overdue   │    │
│  │                                                     [med] │
│  └──────────────────────────────────────────────────────┘    │
│  ── DUE TODAY 1 ──                                            │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ ⓘ ● Review pull request #482     Engineering · Today    │    │
│  │                                          1h 20m [med] │    │
│  └──────────────────────────────────────────────────────┘    │
│  ── TEAM & REPORTS · 3 ▾                                      │
│  ▸ Show 3 team tasks                                          │
└───────────────────────────────────────────────────────────────┘
```

### What's new

| Section | Treatment |
|---|---|
| **4-col stats strip** | "Open", "Due today", "Overdue", "Completed (30d)". Same `gap-px` borderless grid pattern used in Home. Each tile color-coded by tone (brand / amber / red / success) |
| **Inline quick-add row** | Always visible, single row, 5 controls: title input + project select + priority select + due date + Add button. Submitting with Enter adds the task without a modal |
| **Live search** | 250ms debounced URL update, no submit button. Matches title, description, and project name. `×` clear button inside the input |
| **Status filter chips** | Open / Active / Done / All. Default = Open. Hides done/cancelled when "Open" is selected |
| **Priority filter chips** | All / High / Med / Low. Two chip groups side by side, both compact |
| **Bucket grouping by due date** | Overdue / Due today / Tomorrow / This week / Later / No date. Each bucket has its own header with the count and a tone color (red for overdue, amber for today, neutral for the rest). Tasks inside are sorted by priority (high first), then due date, then title |
| **Per-row task card** | 4 elements: status button (cycles todo → in_progress → done), priority dot, title + meta (project chip, due relative, logged time), priority pill. Click the status button to cycle; click anywhere else to navigate to the project (future) |
| **Relative due dates** | "Today", "Tomorrow", "Yesterday", "2d overdue", "in 3d", "in 1w", "Nov 19" — same format as Home and Notifications. Overdue rows render in danger color |
| **Logged time chip** | When a task has time logs, the row shows "1h 20m" as a small chip. Helps the user see "I've been working on this for an hour" at a glance |
| **Project chip** | Every row shows the project name (or "Personal") in the meta line. Replaces the bare "+ add" pattern of the old page |
| **Priority dot** | A 6px colored dot (red / amber / tertiary) before the title. Sorts and signals urgency at a glance |
| **Completed collapsed by default** | A "Completed (N)" disclosure at the bottom. Click to expand and see the recent 30 done items |
| **Team & reports collapsible** | Same disclosure pattern. Only shown for users with `tasks.view_team`. Read-only (the row doesn't have a status button since the user isn't the assignee) |
| **Friendly empty state** | Different copy when filtering vs not. When filtering, a "Clear filters" button resets all 3 filter groups |
| **Permissions respected** | Quick-add + project select + priority select + due date all disabled if the user doesn't have `tasks.create`. The team section is gated by `tasks.view_team` |

### Code

- `src/components/work-client.tsx` (rewritten) — `WorkClient` with
  subcomponents `StatsBar`, `BucketHeader`, `TaskRow`, `QuickAddRow`,
  `EmptyState`, `TeamSection`. Uses native HTML elements and
  `lucide-react` icons throughout
- `src/components/projects-client.tsx` (extracted) — `ProjectsClient`
  was previously in `work-client.tsx`; moved to its own file for
  clarity. Unchanged behavior
- `src/app/(app)/my-work/page.tsx` — thin server wrapper, prefetches
  `listMyTasks` + `listTeamTasks` + `listProjects` + `loggedMinutesByTask`
  in parallel, hands a single `WorkData` blob to the client

### Design decisions worth noting

| Decision | Why |
|---|---|
| **Bucket by due date, not by status** | A user opening the page wants to know "what should I do today?". Grouping by due date answers that. Status grouping ("Open", "In progress") is a secondary view; you can flip the status filter chip to see it |
| **Single inline quick-add row** | A 5-field modal would force a click → type → click → save cycle. The inline row lets you type the title, press Tab to fill the rest, Enter to submit. Power user friendly |
| **Default to "Open" filter** | "Done" tasks belong in the past. The default surface should be "what's not done yet" |
| **Status cycles on the icon button** | Click the circle → in_progress. Click again → done. Click again → todo. Three taps to cycle. Power users love this; new users can use the right-click menu (future). No extra buttons cluttering the row |
| **Completed collapsed** | Most users have 50–500 done tasks. Showing them all clutters the page. The "Completed (47)" disclosure is the standard Linear pattern |
| **Team & reports as a separate section** | The user needs to see their own work first, not their reports' work. Hiding team tasks behind a disclosure keeps the focus on the user's day |
| **Relative time formatting** | "in 3d" / "2d overdue" / "Today" reads naturally. "2026-11-22" is what the user has to mentally convert. Same format as Home and Notifications |
| **Stat strip with click-to-filter** | The stat tiles aren't clickable yet (the next iteration), but they're styled so they could be — each tile has its own padding and color tone, the natural next step is `<Link href="?s=open&bucket=overdue">3 Overdue</Link>` |
| **Personal project as a chip** | When `projectId` is null, the row shows "Personal" with a folder icon. The user always knows whether a task is work or personal |
| **Priority dot + priority pill** | Belt and suspenders. The dot sorts the eye, the pill labels it. Both tone-coded |
| **`QuickAddTask` + `TaskList` removed** | They were inside `work-client.tsx`; the new `WorkClient` is a strict superset. The `/projects` page used `ProjectsClient` which is now in its own file. Net: clearer separation, smaller file |

## Verification

- `npm run typecheck` clean
- `npm run lint` 0 errors (60 warnings, pre-existing or library-internal)
- Full E2E: **64/64 passing** (no regression; the work/tasks E2E steps
  all green)
- Manual visual check: open `/my-work` — see the 4-col stats strip
  at the top, the inline quick-add row, the search + status + priority
  filter chips, and the bucket-grouped task lists. Click the status
  icon on a task to cycle its state. Type in the search to filter

## Backlog (still open)

- **Click-to-filter on the stats strip** — each tile becomes a
  `<Link href="?bucket=overdue">` that filters the page
- **Inline rename on the title** — click the title to edit, blur to save
  (currently requires opening the task on the project page)
- **Time-log widget** — "Log 30m" button on the row to add a time log
  without leaving the page
- **Recurring tasks** — daily / weekly / monthly patterns
- **Subtasks** — child tasks under a parent, with progress auto-rolled-up
- **Bulk actions** — multi-select rows, then "mark done" / "assign to…" / "set due date…"
- **Saved filters** — "My high-priority work this week" as a bookmarkable URL
- **Calendar view** — month grid with task blocks, like the leave
  calendar we just built
