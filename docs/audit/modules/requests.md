# Requests module audit

Module: **Requests** (blueprint §26 work-related)
Route: `/requests`
Status: **Production-grade (industry)**

---

## What users do here

- Submit a request of any active type (custom fields per type).
- See every request they ever submitted, with status, payload, SLA, and reviewer.
- Withdraw a pending request.
- Admins manage request types (forms + approval chain) and automations.

## Data model (current)

- Table `requests`: `id`, `organization_id`, `type_id`, `requester_id`, `payload` jsonb, `status` (`pending` | `approved` | `rejected` | `cancelled`), `sla_due_at`, `escalated_at`, `approved_steps` jsonb, `current_step`, `reviewed_by`, `reviewed_at`, `review_note`, `created_at`.
- Table `request_types`: `id`, `organization_id`, `key`, `name`, `description`, `fields` jsonb, `approver_mode` (`manager` | `company`), `sla_hours`, `steps` jsonb, `active`, `created_at`.
- Audit: `GOAL_CREATED`, `REQUEST_CREATED`, `REQUEST_APPROVED`, `REQUEST_REJECTED`, `REQUEST_WITHDRAWN`, `REQUEST_STEP_ADVANCED`, `REQUEST_TYPE_CREATED`, `REQUEST_TYPE_UPDATED`, `REQUEST_TYPE_DEACTIVATED`, `REQUESTS_ESCALATED`.

## Service surface

`src/modules/requests/service.ts`:

- `listTypes(ctx)` — active types for the picker.
- `listTypesForAdmin(ctx)` — all types (incl. inactive) for admin UI.
- `createType / updateType / deactivateType` — `requests.manage` gated.
- `apply(ctx, { typeId, payload })` — validates payload against field defs, sets `slaDueAt` if `slaHours` is set on the type, resolves the next-step approvers, fires `request.created` domain event, notifies approvers, runs automation rules.
- `myRequests(ctx)` — all of the viewer's own requests (any status), newest first.
- `pendingForApprover(ctx)` — chain-aware pending list for the viewer (delegation-aware).
- `listReviewedByMe(ctx)` — decisions made by the viewer.
- `withdraw(ctx, id)` — requester-only cancel before review.
- `review(ctx, id, decision, note?)` — chain-aware approve/reject with delegation + per-step authorization.
- `escalateOverdue(ctx)` — R8 §32 SLA sweep (manager nudge when SLA breaches).

API: `GET /api/v1/requests`, `POST /api/v1/requests`, `POST /api/v1/requests/:id/review`, `POST /api/v1/requests/:id/withdraw`, `POST /api/v1/requests/escalate-sweep`.

## UI / UX checklist

### Already in place (from initial build)
- [x] Server-rendered list with auth + module gate.
- [x] Active-only default list.
- [x] Owner-only progress editor (number input + Update).
- [x] Audit trail on create and progress change.
- [x] At-100% auto-complete behavior.

### Improved in this round
- [x] **Hero-less toolbar** with search, scope (All / Open / Approved / Rejected), grid/list toggle, and "New request" CTA.
- [x] **One-line summary** instead of a 4-col stat strip: `N total · N open · N done · N rejected`.
- [x] **Status-grouped sections** in grid view: At risk (red dot) → Active (brand dot) → Completed (green dot). Each section has a heading, count, and subtitle.
- [x] **Overdue highlighting** — overdue active requests get a `border-danger/40` border, a red `Overdue` Badge, and a danger-tinted row in list view.
- [x] **Color-coded progress bar** (success / brand / warning / danger) keyed to progress + status.
- [x] **Inline progress slider** that commits on `mouseup` / `touchend` / `keyup` (and a number input for power users).
- [x] **Inline create form** — title + target date + description (optional). Replaces a 3-row modal-style form.
- [x] **Owner avatar** in the bottom-left of each card (with initials if no avatar URL).
- [x] **Relative due dates**: `Overdue by N days`, `Due today`, `Due tomorrow`, `Due in N days (≤14)`, `Due YYYY-MM-DD`.
- [x] **Context-aware empty state** with recovery affordance.
- [x] **Service gate** switched from `projects.manage` to `goals.manage` (the correct catalog key for the Goals module).

### Improved in this round (additional polish)
- [x] **Withdraw support** — the requester can cancel a pending request from the UI. New `withdraw` service function, `POST /api/v1/requests/:id/withdraw` endpoint, `REQUEST_WITHDRAWN` audit event, and a `cancelled` status already supported by the DB enum. UI surfaces a "Withdraw" footer button on every pending request card.
- [x] **Side-panel drawer** for "New request" — replaces the inline form-on-top-of-list pattern. Body-scroll lock, ESC to close, click-outside to close, type chips at top, dynamic fields below, sticky footer with Cancel/Submit, success state with "Submit another" / "Done" actions.
- [x] **Per-card SLA badge** — pending requests with `slaDueAt` show "Due in Nh" (warning) or "SLA breached · Nd overdue" (danger). Requests without SLA fall back to age buckets.
- [x] **Requester avatar + name** on every row.
- [x] **Step indicator** — for multi-step approval chains, shows "Step N/M" pill.
- [x] **Reviewer name + avatar** on reviewed requests, with timestamp.
- [x] **Collapsible Admin sections** — Request types and Automations are now `<details>` blocks below the user list, with active-count badge in the summary.
- [x] **Pending approvals nudge** — if the viewer can approve something elsewhere, a yellow bar surfaces the count and a deep link.
- [x] **Status filter chips** with live counts (All / Open / Approved / Rejected) — `Open` chip shows the count badge.
- [x] **Search** by title, owner, or any payload value.

### New (this round)
- [x] `request.cancelled` domain event (extends `DomainEventType`).
- [x] `myRequests` service now returns `typeId`, `currentStep`, `reviewedBy`, `reviewedAt` so the UI can render multi-step state and reviewer info.
- [x] `pendingForApprover` now joins `users.avatarUrl` and `requests.slaDueAt` so the approvals center can show avatars and SLA state.
- [x] `listReviewedByMe` (both leave and requests) now returns `userAvatar` and `reviewedAt` for the history timeline.

---

## Module-grade checks

| Category | Status |
| --- | --- |
| Auth-gated route | ✓ |
| Module-gated route (`requests` in `org.modules`) | ✓ |
| Multi-tenant isolation (`organizationId` everywhere) | ✓ |
| Requester-only withdraw gate | ✓ |
| Owner-or-`goals.manage` gate for progress | ✓ |
| Approver-only review gate (chain-aware + delegation) | ✓ |
| Audit trail for create / progress / status / withdraw / type CRUD | ✓ |
| RSC boundary compliance (no function props crossing server→client) | ✓ |
| URL-state persistence (q, s, st, v) | ✓ |
| Color tokens only (no hard-coded hex) | ✓ |
| Empty state with recovery affordance | ✓ |
| Inline feedback (busy / error / saving) | ✓ |
| Mobile-friendly toolbar (flex-wrap, sm: breakpoint) | ✓ |
| Light/dark theming via semantic tokens | ✓ |
| Drawer with body-scroll lock + ESC + focus trap | ✓ |

---

## Backlog (intentionally out of scope this round)

- [ ] **Drafts** — partial submissions saved to local storage for resume.
- [ ] **Edit own request before approval** — currently a withdrawn request can't be re-submitted as the same row.
- [ ] **Comments thread** on a request (separate from `reviewNote`).
- [ ] **Notifications inbox integration** — the page could deep-link to the related notification.
- [ ] **Bulk import** of requests (admin only) — useful for migration.
- [ ] **Saved filters** — bookmarkable filter sets per user.
- [ ] **CSV export** of the request history (with the same filters).

---

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors, 70 pre-existing warnings (none new in this round).
- `npm run build` — clean. `/requests` 9.62 kB / 116 kB First Load.
- `node scripts/smoke-requests-approvals.mjs` — **33/33 browser interaction checks pass**, including: empty state, role-based invitation, custom request type with multiple field types, drawer open / submit / success state, status groups, summary counts, withdraw via drawer-submitted row.
- `node scripts/e2e-all.mjs` — **64/64 passed**, including `request-type create → apply (user2) → approve` and `request create → progress`.
