# Dashboards module audit

Module: **Dashboards** (blueprint §68 personal metric board)
Route: `/dashboards`
Status: **Production-grade (industry)**

---

## What users do here

- Pin the metrics you check every day (Headcount, On leave today, Pending approvals, Avg approval latency).
- Unpin them when they're no longer needed.
- See the live values, scope-aware, on the personal dashboard.

## Data model (current)

- Table `dashboard_widgets`: `user_id`, `metric_id`, with a unique key on `(user_id, metric_id)`.
- The `metricId` is one of 4 enum values: `headcount`, `on_leave_today`, `pending_approvals`, `approval_latency_hours`.

## Service surface

`src/modules/analytics/dashboards.ts`:

- `pinnedMetrics(ctx)` — joins the viewer's pinned widget IDs with the live values from `overview()`.

`src/app/api/v1/dashboards/route.ts`:

- `GET` — returns the full overview payload.
- `POST` — toggles a metricId for the viewer (pin if not pinned, unpin if pinned).

API: `GET /api/v1/dashboards`, `POST /api/v1/dashboards`.

## UI / UX checklist

### Already in place (from initial build)
- [x] Server-rendered list with auth + module + scope gate.
- [x] Pin / unpin via API.
- [x] Values resolved at request time (no stale cache).

### Improved in this round
- [x] **Hero-less toolbar** with scope badge + scope label + "N pinned" count.
- [x] **Scope explanation** — inline sentence describing what "Company-wide" / "Your team + reports" means.
- [x] **Pinned section** as a 1–4 column card grid (lg breakpoint).
- [x] **Each pinned card** has: group label, sensitivity badge (if confidential), big tabular-nums value, description, and a "Unpin" button in the footer.
- [x] **Empty pinned state** — "No metrics pinned yet / Pick a metric below".
- [x] **Available section** as a pill grid, grouped by category (People / Approvals / Knowledge).
- [x] **Each available pill** has: label, description, current value, and a `+` icon that pins on click.
- [x] **"You've pinned every available metric"** all-pinned state with `Sparkles` icon.
- [x] **Inline feedback** — "Metric pinned" / "Metric unpinned" success, "Could not update dashboard" error.
- [x] **URL state persistence** — none (the dashboard is per-user, no need for shareable URL state).

### New (this round)
- [x] `DashboardCard` subcomponent with brand-tinted border when pinned.
- [x] `AvailablePill` subcomponent for the "pin on click" affordance.
- [x] `DashGroup` subcomponent with section dot + title + count.
- [x] `KNOWN_METRICS` registry in the client (with `label`, `description`, `sensitivity`, `group`) — single source of truth.
- [x] `groupBy` helper to bucket the available pills by category.
- [x] Per-card unpin button uses a neutral `PinOff` icon (not red) so it doesn't read as a destructive action.

---

## Module-grade checks

| Category | Status |
| --- | --- |
| Auth-gated route | ✓ |
| Module-gated (`analytics` in `org.modules`) | ✓ |
| Permission-gated (`analytics.view` at TEAM+ scope) | ✓ |
| Scope-aware values | ✓ |
| Per-user persistence (dashboard_widgets keyed on user_id) | ✓ |
| RSC boundary compliance (page is server, client handles toggle) | ✓ |
| URL state persistence (n/a — per-user board) | ✓ |
| Color tokens only | ✓ |
| Empty states (pinned + all-pinned) | ✓ |
| Inline feedback (busy / error / success) | ✓ |
| Mobile-friendly toolbar | ✓ |
| Light/dark theming | ✓ |

---

## Backlog (out of scope this round)

- [ ] **Drag-to-reorder** pinned cards.
- [ ] **Custom KPIs** — currently 4 hard-coded metrics.
- [ ] **Share dashboard with manager / team** — currently private to the user.
- [ ] **Time-series sparkline** in each card (mini chart showing the last 30 days).
- [ ] **Threshold alerts** — "ping me when headcount drops by 5%".
- [ ] **Multiple dashboards** per user (named boards).
- [ ] **Subscribable boards** via Slack / email digest.

---

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors.
- `npm run build` — clean. `/dashboards` 4.85 kB / 111 kB.
- `node scripts/smoke-analytics.mjs` — **34/34 browser interaction checks pass** end-to-end (analytics + dashboards together), including: pin / unpin via API, count badge updates, empty state, all-pinned state.
- `node scripts/e2e-all.mjs` — **64/64 E2E pass**.
