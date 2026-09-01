# Module Excellence Checklist — Finance

Program: module-by-module industry-grade upgrade. Competitor grounding:
Brex / Ramp (multi-currency rollup, real-time budget burn), Rippling
(unified approval center, bulk-approve), Expensify (category breakdown
tiles), Spendesk (per-row currency, status timeline). Research note:
web-search tool was unavailable this session; patterns from established
product knowledge.

## Already present (before this round)

- D12 service `src/modules/finance/service.ts` covering expenses,
  purchase requests, travel, vendors, budgets
- Submitter-visibility filter (own + reports') plus a `finance.view_company`
  scope; `expenseVisible()` enforces it on every read
- Self-approval blocked at the action layer (`submittedBy !== ctx.user.id`)
- Six expense statuses (draft / submitted / approved / rejected /
  reimbursed / canceled) with the matching purchase and travel enums
- 10 MB / blocked-ext / mime guards in the upload route
- Budgets: per-period allocation, `spent_cents` counter, ≥80% warning
- Approval center page listing three queues side by side
- `financeHome()` already over-fetched `recentVendors` but the page
  ignored it

## Improved this round

- **Home stats strip** — four tiles (My pending / Awaiting approval /
  Open purchases / Budget warnings). Awaiting approval only shows for
  approvers; the tile is the canonical "what should I be doing" surface
  for finance leads
- **Multi-currency pending totals** — `financeHome()` now groups pending
  expenses by currency. The tile and the row both show every distinct
  currency so a USD + EUR tenant never silently sums them
- **"Your last 30 days" tile** — by-category spend for the viewer's
  approved+reimbursed expenses, broken out per currency. Surfaces the
  most common self-audit question ("how much am I spending on X?")
- **Recent vendors** — the data was already being fetched; the card now
  actually renders it with a status badge per vendor
- **Quick links** — promotes the Approval center above the list, since
  that's the highest-traffic link for finance leads
- **Expenses list search + sort** — new `?q=` and `?sort=` params
  (recent / amount / date) flow into `listExpenses()` as a SQL ILIKE +
  a column-driven ORDER BY. The form preserves the current state via
  hidden fields and visible inputs
- **Per-currency totals row** — the visible-row totals are broken out
  per currency; the header subtitle notes "Multi-currency view: …" so
  approvers see at a glance that they're not looking at one number
- **Expense detail activity timeline** — replaces the flat History card
  with a vertical step indicator (Created → Approved/Rejected →
  Reimbursed). Each step is color-coded by tone and shows the timestamp
  when known. Pending steps render muted
- **Bulk approval center** — the three queues now share a single
  `BulkApprovalList` client component with a select-all checkbox,
  per-row selection, and an "Approve N" button. Each row is independently
  disabled if the user can't approve it (e.g. their own expense). On
  success the queue refreshes via `router.refresh()`

## New this round

- **Stat tone** — `Stat` gained a `tone` prop (neutral / amber / red /
  brand / green) so the home tiles can color-code urgency without
  abandoning the semantic-token system
- **`BulkApprovalList` contract** — `ApprovalItem` exported interface
  documents the row shape so future queue types (e.g. invoices) can
  drop in
- **`listExpenses` `q` + `sort`** — server-side filter and sort, with
  the existing `status` and `mine` params still working as before
- **`financeHome` returns `myPendingByCurrency` and `myCategorySpend`**
  — additive, no breaking changes for any other caller

## Verification

- `npm run typecheck` clean
- `npm run lint` 0 errors (12 warnings pre-existing)
- Full E2E: **59/60 passing** (no regression; the existing finance
  submit/approve flow still green)
- Manual visual check: home renders the four tiles, the multi-currency
  hint is hidden when only one currency is in play, the activity
  timeline shows muted "pending" steps when a decision is still in
  flight, and the bulk-approve checkboxes + button appear in the
  approval center

## Backlog (not in this round)

- Server-side column sort on the approvals page (currently the
  list order is whatever `listExpenses` returned; per-column
  sort headers could be added later)
- Per-row audit history with the actor's name (currently the
  `decided_by` FK is stored but not surfaced on the detail page)
- Multi-currency totals on the home tile should ideally show
  a converted total in the org's reporting currency — would
  require an FX rate table or an external rate source
- Inline comment thread on an expense (currently a one-shot
  rejection; longer conversations need a separate table)
