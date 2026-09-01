# Approvals module audit

Module: **Approvals** (blueprint §26–§28 manager workflows)
Route: `/approvals`
Status: **Production-grade (industry)**

---

## What users do here

- See every pending decision (leave + generic requests) that the viewer can act on.
- Approve or reject with optional reason.
- Bulk-approve selected items.
- Review past decisions grouped by day.
- Delegate approval authority to a teammate for 7 days.

## Data model (current)

- Pulls from `leave_requests` and `requests` tables (existing schemas).
- Joins: `users` (name + avatar), `employees` (job title, department), `leave_types` / `request_types`, `audit_log` (for reviewed-by).
- Approver authorization: chain-aware (multi-step OK), delegation-aware (§27), scope-aware (SELF/TEAM/DEPARTMENT/COMPANY/GLOBAL).
- Audit: `LEAVE_APPROVED`, `LEAVE_REJECTED`, `REQUEST_APPROVED`, `REQUEST_REJECTED`, `REQUEST_STEP_ADVANCED`, `REQUEST_WITHDRAWN`.

## Service surface

`src/modules/leave/service.ts`:

- `pendingForApprover(ctx)` — pending leave items the viewer can act on, with requester name, job title, department, dates, days, reason.
- `listReviewedByMe(ctx)` — decisions already made by the viewer, newest first.

`src/modules/requests/service.ts`:

- `pendingForApprover(ctx)` — pending generic requests, chain-aware, with requester, type, payload, current step, total steps, SLA, escalation.
- `listReviewedByMe(ctx)` — past decisions, with payload for context.
- `review(ctx, id, decision, note?)` — chain-aware approve/reject with delegation + per-step authorization.

`src/modules/approvals/delegation.ts`:

- `listMyDelegations(ctx)` — active delegations from the viewer to others (R0 §27).
- `createDelegation` / `revokeDelegation` — manage the delegation queue.

API: `POST /api/v1/leave/:id/review`, `POST /api/v1/requests/:id/review`, `GET/POST/DELETE /api/v1/delegations`.

## UI / UX checklist

### Already in place (from initial build)
- [x] Server-rendered list with auth + permission gate (`leave.approve` OR `requests.approve`).
- [x] Tabs for Pending / Approved / Rejected.
- [x] Per-item Approve / Reject buttons.
- [x] Bulk approve selected (server-side).
- [x] Reject requires a reason (3+ chars).
- [x] Delegations card with email lookup + 7-day expiry.
- [x] Audit trail for approve / reject / step advance.

### Improved in this round
- [x] **Hero-less toolbar** with three tab chips that include live counts (Pending / Approved / Rejected).
- [x] **Per-item SLA / age badge** — every pending item shows a "Due in Nh" (warning) or "SLA breached · Nd overdue" (danger) pill on the right; items without an SLA fall back to age buckets.
- [x] **Stale filter** — a single click to surface only items past their SLA or older than 3 days.
- [x] **Age filter** — All / Stale / Today / This week.
- [x] **Kind filter** — All / Leave / Requests — so a manager can scope to one domain when overloaded.
- [x] **Requester avatar + name** on every pending item, with kind badge (Leave / Request) right next to the title.
- [x] **Step indicator** — for multi-step approval chains, the active step pill ("Step 2/3") is shown.
- [x] **SLA-breach border** on the card itself (not just the badge) so it stands out in the list.
- [x] **History view as a date-bucketed timeline** — Today / Yesterday / This week / Earlier this month / "Month YYYY". Each bucket has a count badge.
- [x] **History items** show requester avatar, title, status badge, kind badge, note, and decision timestamp.
- [x] **Bulk-action sticky bar** — when items are selected, a branded bar appears at the top with "Approve all" and shows the count. Replaces the in-card "Approve selected" button.
- [x] **Promise.allSettled bulk approve** — partial failures show an error message with success/fail counts instead of silently failing.
- [x] **Empty states** — "Inbox zero" with a friendly subtitle (when there are no pending items) and "No matches" with a hint to clear filters (when filters are too narrow).
- [x] **Kind context in the subtitle** — for leave items, the subtitle includes `start → end · N days · job title · department · reason`. For request items, it includes humanized payload fields (e.g., `Destination: Tokyo · Cost: 2400`).
- [x] **Decision timestamps** in the history view are full local strings (date + time) instead of opaque ISO.

### New (this round)
- [x] `pendingForApprover` (both leave and requests) now joins `users.avatarUrl`, `slaDueAt`, and `escalatedAt` so the UI can show avatars and SLA state.
- [x] `listReviewedByMe` (both leave and requests) now returns `userAvatar` and `reviewedAt` for the history timeline.
- [x] `humanizeKey()` helper turns `cost` → `Cost`, `destination` → `Destination`, etc. in the request subtitle.

---

## Module-grade checks

| Category | Status |
| --- | --- |
| Auth-gated route | ✓ |
| Permission-gated route (`leave.approve` ∨ `requests.approve`) | ✓ |
| Multi-tenant isolation | ✓ |
| Chain-aware approval (multi-step OK) | ✓ |
| Delegation-aware (§27 R0) | ✓ |
| Scope-aware (SELF/TEAM/DEPARTMENT/COMPANY/GLOBAL) | ✓ |
| Per-step authorization | ✓ |
| Audit trail | ✓ |
| RSC boundary compliance | ✓ |
| URL/state persistence (q, age, kind) | ✓ |
| Color tokens only | ✓ |
| Empty / no-match states | ✓ |
| Inline feedback (busy / error / saving) | ✓ |
| Mobile-friendly toolbar | ✓ |
| Light/dark theming | ✓ |
| Bulk-action safety (partial-failure report) | ✓ |
| Reject reason required (3+ chars) | ✓ |
| Reviewer can't approve their own request | ✓ |
| Notification to requester on decision | ✓ |
| Email + in-app notification channels | ✓ |

---

## Backlog (intentionally out of scope this round)

- [ ] **Notifications inbox deep link** — clicking a notification should open the related item in the Approvals center.
- [ ] **Comment thread** between approver and requester (separate from `reviewNote`).
- [ ] **Reassign to a different approver** — escalate without fully rejecting.
- [ ] **Per-item keyboard shortcuts** (J/K to navigate, A to approve, R to reject).
- [ ] **Saved filter presets** — "My team's pending" / "Overdue only" / "Requests only".
- [ ] **CSV export** of the decision history.
- [ ] **Delegation approval** — currently delegations are auto-active; allow a delegate to accept/decline.
- [ ] **SLA escalation telemetry** — admin dashboard showing "approvals breached this week" + per-approver throughput.

---

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors (no new warnings).
- `npm run build` — clean. `/approvals` 7.41 kB / 113 kB First Load.
- `node scripts/smoke-requests-approvals.mjs` — **33/33 browser interaction checks pass**, including: hydration of the new page, requester visible, "Pending" tab active, drawer-style approve UI visible, the admin can switch tabs and see the approved item in history, after withdraw the Pending tab shows the empty state.
- `node scripts/e2e-all.mjs` — **64/64 passed**, including `request-type create → apply (user2) → approve` and `leave apply → approve → balance used`.
