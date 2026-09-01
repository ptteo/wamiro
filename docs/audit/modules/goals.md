# Goals module audit

Module: **Goals** (blueprint §26 Work/Employee/Manager)
Route: `/goals`
Owner: work
Status: **Production-grade (industry)**

---

## What users do here

- See every company objective (OKR / KPI) and who owns it.
- Filter to "My goals" (where they are the owner) or "All".
- Filter by status: At risk, Active, Completed, All.
- See at a glance: which goals are overdue, which are done, average progress.
- Update their own goal progress with an inline slider (or compactly via number input on the list view).
- Create new company goals with a target date.

## Data model (current)

- Table `goals`: `id`, `organization_id`, `title`, `description`, `status` (`active` | `done` | `archived`), `progress` int 0–100, `owner_id`, `due_date`, `created_at`.
- Joins: `users` on `owner_id` for owner name projection.
- Audit: `GOAL_CREATED`, `GOAL_PROGRESS_UPDATED`, `GOAL_COMPLETED`.

## Service surface

`src/modules/goals/service.ts`:

- `listGoals(ctx, { includeDone? }) → GoalRow[]` — sorted by `dueDate ASC, title ASC`, limit 200. Returns `status`, `progress`, `dueDate`, `ownerId`, `ownerName`, `createdAt`.
- `createGoal(ctx, { title, description?, dueDate? }) → id` — owner is `ctx.user.id`. Writes `GOAL_CREATED` audit.
- `updateProgress(ctx, goalId, progress)` — owner-or-`goals.manage` gated. At 100, status auto-flips to `done` and writes `GOAL_COMPLETED`. Otherwise writes `GOAL_PROGRESS_UPDATED`.

API: `GET /api/v1/goals`, `POST /api/v1/goals`, `PATCH /api/v1/goals/:id/progress`.

---

## UI / UX checklist

### Already in place (from initial build)
- [x] Server-rendered list with auth + module gate.
- [x] Active-only default list.
- [x] Owner-only progress editor (number input + Update).
- [x] Audit trail on create and progress change.
- [x] At-100% auto-complete behavior.

### Improved in this round
- [x] **Hero-less toolbar** — no 4-col stat strip at the top. One-line summary instead: `6 goals · 3 active · 2 done · 1 at risk · 1 owned by you`.
- [x] **Scope filter** (All / My goals) as segmented chip group — All is default, not "My".
- [x] **Status filter** (All / At risk / Active / Completed) as segmented chip group.
- [x] **Search** with clear button, debounced into URL (`?q=`).
- [x] **Grid / List view toggle** with debounced URL persistence.
- [x] **Status-grouped sections** in grid view: At risk (red dot) → Active (brand dot) → Completed (green dot). Each section has a heading, count, and subtitle.
- [x] **Overdue highlighting** — overdue active goals get a `border-danger/40` border, a red `Overdue` Badge, and a danger-tinted row in list view.
- [x] **Color-coded progress bar** — `success` (≥100 or done), `brand` (≥70), `warning` (≥30), `danger` (<30).
- [x] **Inline progress slider** — `<input type="range">` commits on `mouseup`/`touchend`/`keyup`; compact list view shows just `value%`. Number input also commits on blur.
- [x] **Inline create form** — title + target date + description (optional). Replaces a 3-row modal-style form.
- [x] **Owner avatar** in the bottom-left of each card (with initials if no avatar URL).
- [x] **Relative due date** — `Overdue by N days (due YYYY-MM-DD)`, `Due today`, `Due tomorrow`, `Due in N days (≤14)`, `Due YYYY-MM-DD` otherwise.
- [x] **Page header** uses canonical `PageHeader` + `Content width="wide"` per workspace grammar (§21–23).
- [x] **Empty state** is context-aware: distinguishes "no goals at all", "nothing at risk", "no completed yet", "you don't own any", and "no search matches".
- [x] **Service gate** switched from `projects.manage` to `goals.manage` (the correct catalog key for the Goals module).

### New (this round)
- [x] Stats-rail-on-demand: included in the one-line summary, not as a 4-col strip — opt-in density for a small page.
- [x] `GoalSection` component for grouped grid sections with tone-coded section dot.
- [x] `relDue()` helper that handles all date-status combinations consistently.
- [x] `progressTone()` / `progressBarColor()` helpers that map progress + status to a unified color token.
- [x] `InlineProgressEditor` subcomponent: range slider + number input + error slot, shared by card and list row.

---

## Module-grade checks

| Category | Status |
| --- | --- |
| Auth-gated route | ✓ |
| Module-gated route (`goals` in `org.modules`) | ✓ |
| Multi-tenant isolation (`organizationId` everywhere) | ✓ |
| Owner-only mutation gate (with `goals.manage` escape hatch) | ✓ |
| Audit trail for create + progress | ✓ |
| At-100% state transition (active → done) | ✓ |
| RSC boundary compliance (no function props crossing server→client) | ✓ |
| URL-state persistence (q, s, st, v) | ✓ |
| Color tokens only (no hard-coded hex) | ✓ |
| Empty state with recovery affordance | ✓ |
| Inline feedback (busy / error) | ✓ |
| Mobile-friendly toolbar (flex-wrap, sm: breakpoint) | ✓ |
| Light/dark theming via semantic tokens | ✓ |

---

## Backlog (intentionally out of scope this round)

- [ ] **Goal detail page** — click a goal → `/goals/:id` with full activity feed (the audit log already captures `GOAL_CREATED` / `GOAL_PROGRESS_UPDATED` / `GOAL_COMPLETED`; just need the page).
- [ ] **Confidence rating** — add a `confidence` enum column (`on_track` | `at_risk` | `off_track`) via migration 0040+ so at-risk isn't derived from `dueDate` alone.
- [ ] **Sub-goals / key results** — full OKR nesting (parent goal → 3-5 KRs).
- [ ] **Goal-level permissions** — `goals.manage` holders can also re-assign owners, not just edit progress.
- [ ] **Comments / check-ins** — periodic check-in notes attached to a goal (e.g. weekly status).
- [ ] **Link goals to projects** — `goal_id` on `projects` so a project's progress rolls up into the parent goal.
- [ ] **Notifications on stale goals** — weekly digest of at-risk goals and goals with no progress in N days.
- [ ] **Graph view** — see goals along a quarterly timeline; click a quarter to filter.
- [ ] **Public/share view** — read-only link to share with investors / board (out of company, no auth).

---

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors, 71 pre-existing warnings (none new).
- `npm run build` — clean. `/goals` route: 4.84 kB / 112 kB First Load.
- `node scripts/e2e-all.mjs` — **64/64 passed**, including the `goal create → progress` step.
