# Module Excellence Checklist — Projects

Program: module-by-module industry-grade upgrade. Competitor grounding:
Notion (color-coded project covers, grid + list view toggle), Asana
(progress bar, lead badge, "my projects" filter), Linear (stat strip
with click-to-filter, two-pane detail with members rail), ClickUp
(board / timeline tab toggle), Height (cover-tinted project hero,
4-col stat strip). Research note: web-search was unavailable; patterns
drawn from established product knowledge of these 2025 project-management
experiences.

## Already present (before this round)

- `listProjects` — org-wide list with name, description, status, open
  task count, member count
- `getProjectDetail` — project + members + tasks with logged minutes
- `createProject` / `addProjectMember`
- `KanbanBoard` — three-column kanban (todo / in_progress / done)
- `GanttChart` — task timeline by due date
- `FavoriteStar` — toggle favorite on a project

## Improved this round (m14 r13 — projects redesign)

The list page was a plain flat list with a single "New project"
button at the top. The detail page had a thin header, a members
sidebar, the Kanban board, and the Gantt chart stacked underneath
the Kanban. This round rebuilds both pages with proper visual hierarchy
and a focus on the project hero.

### Layout — list

```
┌───────────────────────────────────────────────────────────────┐
│  Projects                                                    │
│  Active workstreams across the company.                      │
│                                                               │
│  ┌──── 4-col stats strip (gap-px) ──────────────┐           │
│  │ PROJECTS 6 │ YOU'RE IN 4 │ OPEN TASKS 18 │ HRS 142 │       │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  🔍 Search…  [My projects] [All] [With open work]   [▦][☰]│
│                                          [+ New project]    │
│                                                               │
│  ┌── grid of project cards (1/2/3/4-col responsive) ──┐    │
│  │ ━ Wamiro v2  Lead · Asha Mehta       [You]      │    │
│  │ 📁 Wamiro v2  Wire up the SSO test    12 open    │    │
│  │ ──────────────────────                            │    │
│  │ Progress    3/15 · 20%                            │    │
│  │ ✓ 3 open  👥 5 members  ⏱ 12h                       │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ ━ Marketing campaign  Lead · Diya Iyer            │    │
│  │ 📁 Marketing campaign                                │    │
│  │ ──────────────────────                            │    │
│  │ Progress    8/10 · 80%                            │    │
│  │ ✓ 2 open  👥 3 members  ⏱ 6h                       │    │
│  └─────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────┘
```

### Layout — detail

```
┌───────────────────────────────────────────────────────────────┐
│  ← Projects                                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ 📁  Wamiro v2                          ⭐              │    │
│  │      Wire up the SSO test tenant ...                  │    │
│  │      Lead · Asha Mehta · 5 members · Created Oct 12 │    │
│  │      Progress    3/15 tasks · 20%                    │    │
│  │ ─────────────────────────────────────────────────  │    │
│  │ OPEN 3  │ DUE SOON 2  │ DONE 12  │ MEMBERS 5         │    │
│  │         │ next 3d    │          │                    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  [📋 Board · 15]   [📅 Timeline · 7]                        │
│  ┌── kanban (default) ─────────────────────────────┐        │
│  │  ┌────┐  ┌────┐  ┌────┐                              │        │
│  │  │todo│  │wip │  │done│                              │        │
│  │  └────┘  └────┘  └────┘                              │        │
│  └────────────────────────────────────────────────────┘        │
│                                                               │
│  ┌── MEMBERS (5) ──┐  ┌── QUICK LINKS ──┐                 │
│  │ [avatar] name  │  │ → Your tasks    │                 │
│  │ [avatar] name  │  │ → Approvals     │                 │
│  │ [avatar] name  │  │ → Open in tab   │                 │
│  └────────────────┘  └─────────────────┘                 │
└───────────────────────────────────────────────────────────────┘
```

### What's new

| Section | Treatment |
|---|---|
| **Stats strip on list** | 4-col gap-px strip: Projects total / You're in / Open tasks / Hours logged. Same pattern as Home and My Work |
| **Filter chips on list** | My projects (default) / All / With open work. Plus a search input with debounce + clear button |
| **View toggle (grid / list) on list** | Two icon buttons. Grid = cards (Notion-style). List = compact rows with a colored bar on the left. Default = grid |
| **Color-coded cover** | Every project gets a stable hue from the 8-color palette. The hue is a hash of the project name, so the same project always has the same color across the page. Used in the card (top bar + icon), the list row (left bar), and the detail page (folder icon) |
| **"You" badge** | A small "You" pill on every project the user is a member of. Makes the user's own projects scannable at a glance |
| **Project cards (grid)** | Cover bar (project hue) → icon + name + lead avatar + "You" pill → description (2 lines) → progress bar → stats row (open / members / hours). Hover lifts with a subtle shadow |
| **Project rows (list)** | Compact one-line layout. Color bar + name + "You" pill + progress bar + stats + chevron. Better for scanning many projects |
| **Inline create form on list** | Single-row form at the top of the toolbar. Toggle via "New project" button. No modal, no separate page |
| **Redesigned detail hero** | Folder icon + name + favorite + description + metadata row (lead, member count, created date, total hours) + progress bar + 4-col mini-stat strip (open / due soon / completed / members) |
| **Board / Timeline tabs** | Switch between the Kanban board and the Gantt timeline without leaving the page. Default = board. Count badge per tab |
| **Members grid (2-col)** | Each member is a row with avatar + name + job title. Click to open the profile. HR can add a new member via the existing `AddMemberForm` |
| **Quick links card** | A 1-column right-rail card with shortcuts to "Your tasks", "Approvals", "Open in new tab". Avoids making the user hunt for the relevant module |
| **Breadcrumb** | "← Projects" at the top, replacing the bare "← Back to Projects" text. Replaces the old `<Link>` with the `nav` element + arrow icon |

### Code

- `src/modules/work/service.ts`
  - `listProjects` now returns a rich `ProjectListEntry` with `totalTasks`,
    `doneTasks`, `memberCount`, `totalMinutes`, `ownerName`,
    `createdAt`, `isMember`. Single SQL pass with subqueries + a
    left-join to `users` for the owner
  - `getProjectDetail` projects `createdAt` and adds `avatarUrl` +
    `jobTitle` to the members list (via a left-join to `employees`)
- `src/components/projects-list.tsx` (new) — `ProjectsListClient` with
  `Stat`, `ProjectCard`, `ProjectRow`, `NewProjectForm`, `EmptyState`
  subcomponents. Uses the same 8-hue stable-color palette as the org
  chart
- `src/components/project-detail-tabs.tsx` (new) — `ProjectDetailTabs`
  with two view modes (board / timeline). Wraps the existing
  `KanbanBoard` and `GanttChart`
- `src/app/(app)/projects/page.tsx` — thin server wrapper, `Content
  width="wide"`, hands `listProjects` data to the new client
- `src/app/(app)/projects/[id]/page.tsx` — full hero redesign with
  metadata, 4-col stat strip, tabbed views, members grid, quick links
- `src/components/projects-client.tsx` (deleted) — superseded by
  `projects-list.tsx` (the inline create form moved into the toolbar)

### Design decisions worth noting

| Decision | Why |
|---|---|
| **Grid as default, list as a toggle** | Most project management tools default to a list (Linear, Asana, Height). Notion defaults to a grid. For a small to mid-size org, the grid gives a "wall of projects" feel that helps the user remember what exists. The list view is the power-user mode for sorting 50+ projects |
| **"My projects" default** | Most users only care about the projects they're in. Showing all projects is noisy. The "All" filter is one click away |
| **Project cards with progress bar** | A project without a progress bar is just a label. The bar answers "how far along is this?" at a glance. Color-coded (brand → success) based on percentage |
| **"You" badge on member projects** | A 6-letter pill that says "You" — instantly scannable. Linear's team list does the same thing |
| **Cover color = stable hash** | Same project name → same color, every render. Users build a mental map (Wamiro v2 = blue, Marketing = amber). Round-robin or session-based color picking would defeat the purpose |
| **Tabbed views on detail** | The Kanban board is the default for daily work. The Gantt is for project planning (when is X due). They serve different needs; tabbing between them is faster than a single combined view |
| **Detail hero is rich** | Project metadata (lead, members, created date, total hours) is the kind of info an HR or project manager needs at a glance. Putting it in the hero means the user doesn't have to click into anything to learn the basics |
| **Quick links card on detail** | Cross-references to the other modules. "Your tasks" goes to the user's own task list, "Approvals" goes to the manager's queue, "Open in new tab" — saves the user a context switch |
| **Inline create form** | Inline > modal for a single-field form. The user types a name, hits Enter, and the project appears. No friction |
| **8 hues, not 6** | Most orgs have 5–15 projects. An 8-hue palette covers the common case without wrap-around |

## Verification

- `npm run typecheck` clean
- `npm run lint` 0 errors (64 warnings, pre-existing or library-internal)
- Full E2E: **64/64 passing** (no regression; the projects E2E steps all green)
- Manual visual check: open `/projects` — see the 4-col stats strip,
  the toolbar with search + filter chips + view toggle + new project
  button, and the grid of color-coded project cards. Click "List"
  to switch to the row view. Click a project to land on the
  redesigned detail page with the rich hero, 4-col mini-stats, board /
  timeline tabs, and the members + quick-links grid

## Backlog (still open)

- **Click-to-filter on the stats strip** — each tile becomes a
  `<Link href="?bucket=overdue">` that filters the page
- **Archive project** — moves to an "Archived" tab; hidden from the
  default list
- **Drag to reorder** projects in the grid (Notion-style)
- **Project description editor** — click the description to edit in place
- **Color picker for project cover** — let the user pick a custom color
  (default = hash-derived)
- **Project activity feed** — "X completed task Y", "Z joined the
  project", shown in a tab or sidebar
- **Sub-tasks** — child tasks under a parent task, with progress
  auto-rolled-up
- **Files tab** — document attachments per project
- **Time tracking on task rows** — "Log 30m" button per card
- **Public/private toggle** — let the user mark a project as private
  (members only) vs org-visible
