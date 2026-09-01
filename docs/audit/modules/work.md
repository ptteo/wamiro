# Module Excellence Checklist — Work

Program: module-by-module industry-grade upgrade. Competitor grounding:
Linear (keyboard-first triage, overdue salience), Asana (project completion
progress), Todoist (today-first to-do list). Research note: web-search tool
was unavailable this session; patterns from established product knowledge.

## Already present (before this round)

- My-Work hub: quick-add task, Open / Team & reports / Completed lists with one-click status cycling
- Projects: list + detail with members, Kanban board, Gantt chart, favorites
- Goals with progress updates; time logging per task
- Permission-scoped team visibility (`tasks.view_team`)

## Improved this round

| Feature | Improvement |
|---|---|
| Overdue salience | Task due dates now render red with an "overdue" chip when past due and not done/cancelled — Linear-style urgency signal |
| Header consistency | My-Work header moved to semantic tokens + 20px scale |
| Project completion | Project detail header now shows an Asana-style **completion progress bar** (`done/total`, %, success/brand fill) computed from the project's tasks |

## New this round

| Feature | Detail |
|---|---|
| **Overdue section** on My Work | A dedicated "Overdue (n)" list renders above Open whenever anything is past its due date — triage-first ordering |
| `projectTaskStats()` service helper | Org-scoped per-project rollup available for APIs/dashboards (page uses inline compute over already-loaded tasks) |

## Verification

typecheck clean · lint 0 errors · E2E 59/59 PASS (production build).

## Next Work candidates (backlog)

Status filter tabs (todo/in-progress/done) via searchParams ·
priority badges surfaced in lists · sub-tasks/checklists ·
saved views per project (R5 prefs integration) · keyboard shortcuts (Linear parity).
