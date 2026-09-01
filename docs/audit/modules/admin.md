# Module Excellence Checklist — Admin

Program: module-by-module industry-grade upgrade. Competitor grounding:
Okta (security event feed), Workday (admin home overview + attention
items), Datadog (audit log with actor filter + CSV export), Rippling
(user search with role/status filters). Research note: web-search tool
was unavailable this session; patterns from established product
knowledge.

## Already present (before this round)

- Admin home with Overview (§4), Attention required (§5), Access
  control, Data export, Integrations, Roles in use, and Recent
  administrative activity blocks
- Users page with invite flow (temp password), per-user role chips,
  inline add/remove role, status badges
- Permission overrides with grant/revoke, scope + reason + expiry, all
  audited
- Roles page with member counts, system/custom badges, role detail with
  permission bundle + holders
- Audit log with search + action filter, before/after JSON
- Security center with live sessions and integrations status
- Access reviews (§58 review-and-keep)
- Departments management with manager assignment and member counts

## Improved this round

- **Users search + status + role filters** — the users card now has a
  name/email search input plus two dropdowns (status: all/active/
  suspended/invited; role: any role). All client-side, instant, no
  server round trips. The card header shows "N of M" when a filter is
  active
- **Audit log actor filter** — a dropdown of every org member lets the
  admin scope events by teammate; composes with the existing search and
  action filters
- **Audit log CSV export** — the currently filtered view exports to a
  timestamped CSV via the shared `CsvExportLink` component. Includes
  created_at, action, entity_type/id, actor name, IP, and the full
  before/after JSON
- **Audit log pagination hint** — when exactly one page of results
  returns, a footer note tells the admin to refine the filter rather
  than silently truncating
- **Security events (24h) strip on admin home** — a new card that
  surfaces the last 10 security-classified events from the audit log:
  suspensions, reactivations, invites, permission grants/revocations,
  session revocations, MFA changes, password resets, role grants/
  revocations. Only renders when there is something to show, so an
  empty org doesn't see an empty card
- **Wider security classification** — the SECURITY_ACTIONS list covers
  the 12 security-relevant action names actually used by the codebase
  (verified against `src/lib/audit.ts` call sites)

## New this round

- **Security events query** — `inArray(auditLogs.action, …)` + 24h
  window + tenant scope, ordered newest-first, capped at 10
- **`filteredUsers` memo** in `AdminUsersClient` — search + two filter
  dimensions compose; the invite form and override form still see the
  full user list
- **CSV export re-use** — the audit page is the second consumer of
  `CsvExportLink` (analytics was the first), confirming the component
  contract

## Verification

- `npm run typecheck` clean
- `npm run lint` 0 errors (11 warnings, one fewer than before — an
  unused import was removed as part of the audit page rewrite)
- Full E2E: **59/60 passing** (admin users/roles/audit lists, user
  detail, suspend → session dies → reactivate steps all green)
- Manual visual check: `/admin` shows the new Security events card
  when events exist; `/admin/users` search box filters as you type;
  `/admin/audit` has an actor dropdown and an Export CSV button

## Backlog (not in this round)

- True server-side pagination for the audit log (currently
  page-size-capped at 200 with a hint). A keyset cursor would scale
  past that
- Saved audit filters (e.g. "failed logins this week") — would need a
  per-user saved-search table
- Bulk user actions (suspend N users, export selected) — the bulk
  pattern proven in Finance approvals could be lifted here
- Per-role permission diff view (compare two roles side by side)
- SCIM directory sync for automated user provisioning
