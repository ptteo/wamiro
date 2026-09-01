# Wamiro Design-Phase Audit & Checkpoint — 2026-08-25

All eight specs in `docs/desgin-phases/` (D1–D8) were read in full by independent
audit agents (~15k lines of spec), and every requirement was verified against the
actual code. This document is the honest per-phase result after the same session's
repair + implementation pass.

Verification at time of writing: `npm run verify` GREEN (lint 0 errors · typecheck
clean · 14/14 unit tests · cross-tenant integration suite PASS incl. cleanup) and
`npm run build` GREEN (51 routes, all authed pages `ƒ dynamic`). Migrations 0001–0025
applied to the live database.

## Bugs found and fixed this session

| # | Bug | Fix |
|---|-----|-----|
| 1 | Duplicate `approvalDelegations` decl + duplicate `AnyPgColumn` import broke typecheck | Converged schema on the shape that exists in the live DB (`delegator_id/delegate_id/expires_at/active/created_by`); deleted orphan duplicate module |
| 2 | Attendance TEAM branch returned snake_case keys (`user_id`) — manager views broken | SQL aliases camelCase |
| 3 | Leave approval didn't record usage when no balance row existed | Upsert on approve |
| 4 | JS arrays bound into `ANY(${arr}::uuid[])` crashed analytics/work/surveys (drizzle flattens to a tuple) | Single bound array-literal param, 6 sites |
| 5 | `users.organization_id` / `leave_requests.user_id` FKs had no ON DELETE → tenant/user teardown impossible | migration-0024 cascades both |
| 6 | ~250 className refs to undefined CSS vars (`--color-ink/muted/line`, `--color-brand-50..700`) + typo class `bg-success-subtle0` ×3 | Legacy alias layer in globals.css (:root + .dark), typos fixed, AA contrast fix on `--text-tertiary`, added `--surface-sidebar` |
| 7 | `PUT /api/v1/request-types/[id]` silently wiped approval chains; DELETE handler missing (405) | steps forwarded; DELETE → deactivateType |
| 8 | **Security:** `GET /api/v1/tickets` leaked every org ticket to any employee | Scoped to requester/assignee unless `tickets.manage` |
| 9 | `tickets.manage` grantable by no role → no agents could exist; New-ticket form hidden | Seeded to hr_admin/admin/ceo (catalog + migration-0025); form gated on page-level `tickets.create` |
| 10 | Discussion replies counted but never rendered | Client fetches GET `/discussions/[id]` and renders thread |
| 11 | Read APIs bypassed permission gates (`GET /knowledge`, `GET /documents`) | `{permission}` gates added; announcements/discussions pages check module switch |

## Features implemented this session

- **Approval delegation end-to-end (D4 §27):** enforcement wired into leave +
  requests queues/reviews via `resolveApprovalActors()` (delegate never exceeds own
  scope), new `/api/v1/delegations` route, DelegationsCard UI on Approval Center.
- **Workspace shell (D1/D5 addendum):** AppRail mounted; contextual sidebar from
  `workspaces.ts` config intersected with modules+permissions (longest-prefix
  active-workspace resolution); mobile workspace menu replaces chip strip; all 27
  links preserved with byte-equivalent gates.
- **AI assistant (D8):** conversation history restored on reopen, API module gate,
  Retry affordance + softened errors, failure auditing, aria-live/log semantics,
  semantic pgvector search wired into the assistant's knowledge tool.
- **Executive visibility:** `ceo` role granted `analytics.view_company` (+ backfill).

## Per-doc status

| Doc | Status after this pass | Remaining major gaps (honest) |
|-----|------------------------|-------------------------------|
| D1 design foundation | Tokens repaired & theme-aware; Rail+sidebar+mobile nav live; PageHeader still adopted by few pages | Full component library (DataTable/Skeleton/Toast/etc.), density system, docs/design/*, radius ladder exactness |
| D2 people experience | Solid core verified; CEO analytics fixed | Team/department detail pages, profile editing/avatar/tabs, directory pagination+bulk, attendance calendar/statuses, PeopleTable/FilterBar recipes |
| D4 requests/approvals | Data-loss bugs fixed; delegation fully working; multi-step chains solid | Workflow Builder/versioning/runs, request detail screens, SLA/escalation, comments/attachments, extra field types, search expansion |
| D5 knowledge/docs/comms | Reply bug + permission gates fixed; favorites/storage/search security verified | Knowledge categories/lifecycle/versioning, document folders/versions/sharing/trash/preview/search, shared comments+mentions, announcement pinning/audiences, internal inbox |
| D5-rev workspace arch | Rail/contextual sidebar/mobile menu implemented; saved-views backend exists | Saved-view UI consumers, contextual ⌘K commands, scoped search, launcher/pinning |
| D6 support/assets | Security hole closed; agent model fixed; SLA stamping exists | Ticket detail screen/conversation UI/assignment, asset lifecycle fields/history, Support/IT homes, service catalog, incidents/problems/changes, devices |
| D7 analytics/executive | Scoping bugs fixed (array params, CEO access); KPI strip correct | Dashboards card-grid→strip redesign, freshness/source metadata, header unification (palette ruling needed on success/info colors) |
| D8 AI intelligence | Core tool loop + persistence verified; 6 gaps closed | Citations/structured answers, contextual entry points, more domain tools, retention policy, AI isolation tests |

## Deliberate decisions recorded

1. Live database is source of truth where code had drifted (delegation columns).
2. Semantic success/info tokens kept despite strict-palette phase language — they
   ship throughout the product and match the cycle-30 master design prompt;
   flagged as needing a formal palette ruling.
3. `src/lib/saved-views.ts` kept (route-backed); dead duplicates removed.
