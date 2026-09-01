# Module Excellence Checklist — Analytics

Program: module-by-module industry-grade upgrade. Competitor grounding:
Looker / Metabase (one-line per metric + comparison vs prior period),
Mixpanel (per-metric definition registry), ChartMogul (multi-currency
rollups). Research note: web-search tool was unavailable this session;
patterns from established product knowledge.

## Already present (before this round)

- `src/modules/analytics/service.ts` exposes a metric registry with one
  definition per KPI, every value passed as a bound parameter (no string
  SQL)
- TEAM/COMPANY scope via `widestScope(ctx.access, "analytics.view")`; team
  scope automatically limits to self + direct reports
- KPI strip + BarChart primitives (`src/components/analytics-bars.tsx`)
  following the Frappe-grammar redesign
- One chart (clock-ins, last 7 days)
- Pinned metrics on the Home dashboard (separate module)
- `dashboards.ts` joins `dashboardWidgets` for user-pinned metrics
- Analytics route is server-rendered; no client-side charting

## Improved this round

- **30-day-prior comparisons** — every primary metric (headcount, on
  leave today, pending approvals) now shows a delta vs the same
  metric 30 days ago. Up/Down/Flat sign with a percent
- **Comparison tone** — `KpiStrip` gained a `comparisonTone` prop
  ("positive" / "negative" / "neutral") so the delta text can be
  color-coded. Headcount up = positive (green); pending approvals up
  = negative (red); on leave up = neutral
- **Operations strip** — four additional KPIs (open positions, hires
  30d, knowledge articles, overdue obligations)
- **Finance & risk strip** — pending expenses by currency, budget
  utilization, avg approval time, overdue obligations
- **Multi-currency rollup** — expenses awaiting approval renders as
  "$X · $Y" when more than one currency is in play, never silently
  summed across currencies
- **Expenses by category (30d)** + **Leave by type (30d)** charts —
  second/third chart sections
- **Scope badge** in the header makes the active scope explicit
  ("Company scope" / "Team scope")
- **Snapshot CSV export** — `CsvExportLink` client component turns an
  array of rows into a downloadable file with no extra deps; the
  analytics page exports a snapshot of all current KPIs

## New this round

- **`computeHeadcountPrior30d` / `computePendingApprovalsPrior30d` /
  `computeOnLeaveTodayPrior30d`** — three new scalar metrics
- **`computeOpenPositions` / `computeHires30d` /
  `computeKnowledgeArticles` / `computeOverdueObligations` /
  `computeBudgetUtilizationPct` / `computeExpensePendingCents` /
  `computeExpensePendingByCurrency`** — eight new scalar metrics
- **`computeExpenseByCategory30d` / `computeLeaveByType30d`** — two
  new chart-series projections
- **`registryDocumentation` extended** — every new metric is now
  documented for the future admin metric browser
- **`CsvExportLink` client component** — reusable across pages
  (e.g. could be hooked up to People/Work later for one-click exports)

## Bugs caught and fixed during the rollout

- The leave_by_type query referenced `lr.status IN ('approved','reimbursed')`,
  but the `leave_status` enum does not include `reimbursed` (that's an
  expense status). The query now uses just `approved` and the E2E is back
  to 59/60 green
- The `knowledge_articles` table has no `status` column — removed the
  `status = 'published'` filter, the count is now over every article
  in the org

## Verification

- `npm run typecheck` clean
- `npm run lint` 0 errors (12 warnings pre-existing)
- Full E2E: **59/60 passing** (the analytics + dashboards steps now
  exercise the expanded metric set end-to-end)
- Manual visual check: open `/analytics`, see three KPI strips, the
  clock-ins chart, the expenses-by-category chart, the leave-by-type
  chart, and an "Export CSV" button at the top right that downloads
  a snapshot of the current values

## Backlog (not in this round)

- Real charts (line / area) — current `BarChart` is intentional for
  density, but a line chart for the 30-day attendance series would
  read more naturally than bars. Would need a small SVG path
  component
- Per-metric drill-down — each KPI could link to a deeper report
  (e.g. "Open positions" → /people/recruitment). Currently the
  numbers are surface-level
- Saved views / custom date range — the page renders the canonical
  period; a date picker could be added later
- Anomaly detection (e.g. "expenses up 40% vs last month") — would
  require a baseline + threshold
