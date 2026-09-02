# Analytics module audit

Module: **Analytics** (blueprint §68 metric registry + overview)
Route: `/analytics`
Status: **Production-grade (industry)**

---

## What users do here

- See a snapshot of the company's (or their team's) most important numbers.
- Spot deltas vs 30 days ago on Headcount, On-leave, Pending approvals.
- Drill into activity (clock-ins by day), finance (expenses, budget utilization), and compliance (overdue obligations, approval latency).
- Export the metrics as CSV.

## Data model (current)

No new schema. The page computes values from existing tables via parameterized SQL in `src/modules/analytics/service.ts`. The registry pattern means every metric has ONE definition, computed server-side, never inline in UI.

## Service surface

`src/modules/analytics/service.ts`:

- `overview(ctx)` — runs 17 scalar queries in parallel, returns the `Overview` object. Returns `null` if the viewer has no `analytics.view` permission.
- `registryDocumentation` — exports the public metric metadata for documentation surfaces.

API: `GET /api/v1/analytics` (returns `{ widgets: overview }` for dashboards).

## UI / UX checklist

### Already in place (from initial build)
- [x] Server-rendered metrics with auth + module + permission gate.
- [x] CSV export.
- [x] Scope-aware values (TEAM vs COMPANY).
- [x] 30-day-prior comparison for Headcount, On-leave, Pending.
- [x] Bar charts for Activity / Expenses by category / Leave by type.

### Improved in this round
- [x] **Hero-less toolbar** with scope badge + "Last 30 days" + CSV export CTA.
- [x] **Scope explanation line** — explains what "Company-wide" / "Your team + reports" actually means.
- [x] **KPI rail** in a card with 4-up layout: Headcount, On leave today, Pending approvals, Avg approval (hours).
- [x] **Section grouping** with consistent dot indicators:
  - Workforce (brand)
  - Activity (success)
  - Compliance (success or danger based on overdue count)
  - Finance & risk (warning when budget ≥ 90%, brand otherwise)
  - Time off (success)
- [x] **Mini-KPI grid** in each section — full-width stat boxes with delta/label, tone-coded.
- [x] **Compliance section dot turns danger** when overdue obligations > 0.
- [x] **Finance section dot turns warning** when budget utilization ≥ 90%.
- [x] **Cleaner bar charts** — wider label column, more readable bar values, rounded corners.
- [x] **Context-aware empty states** — "No analytics in your scope" when the viewer lacks permission, "This module is disabled" when the org doesn't have it.
- [x] **Avatar-less, icon-less, emoji-less** — pure semantic tokens, no gradients, no oversized containers.
- [x] **Page-level `Content width="wide"`** for the two-column section layout.

### New (this round)
- [x] `AnalyticsOverview` typed client shape that surfaces all 17 metrics as discriminated properties.
- [x] `MiniKpi` subcomponent with tone-aware value color and per-section context.
- [x] `Section` subcomponent with consistent dot + title + subtitle layout.
- [x] `DeltaMark` with TrendingUp / TrendingDown / Minus icons.
- [x] `fmtMoneyCents` helper handles single-currency, multi-currency, and zero cases.

---

## Module-grade checks

| Category | Status |
| --- | --- |
| Auth-gated route | ✓ |
| Module-gated (`analytics` in `org.modules`) | ✓ |
| Permission-gated (`analytics.view` at any scope) | ✓ |
| Scope-aware (TEAM / DEPARTMENT / COMPANY / GLOBAL) | ✓ |
| CSV export with stable column order | ✓ |
| RSC boundary compliance (page is a server component, exports via analytics-overview) | ✓ |
| Color tokens only (no hard-coded hex) | ✓ |
| Empty states (org-disabled, no-scope) | ✓ |
| Mobile-friendly toolbar (flex-wrap) | ✓ |
| Light/dark theming via semantic tokens | ✓ |

---

## Backlog (out of scope this round)

- [ ] **Period selector** (last 7 / 30 / 90 days) — currently hard-coded to 30.
- [ ] **Scope switcher** for users with both team and company access.
- [ ] **Per-metric drill-down** — clicking a KPI goes to the relevant list (e.g. Headcount → /people).
- [ ] **Time-series charts** — currently the 7-day clock-ins is the only series; expense / leave are 30-day aggregates.
- [ ] **Comparison to prior year** — currently just 30-day delta.
- [ ] **Custom dashboards** — multiple named dashboards per user; currently only one personal board.
- [ ] **Saved views** for the CSV export shape.

---

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors.
- `npm run build` — clean. `/analytics` 545 B route + analytics-overview chunk.
- `node scripts/smoke-analytics.mjs` — **34/34 browser interaction checks pass**, including: scope badge, period, all section names, all mini-KPIs, all bar chart titles, pin/unpin flows, empty state.
- `node scripts/e2e-all.mjs` — **64/64 E2E pass**.
