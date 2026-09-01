# Module Excellence Checklist — Support

Program: module-by-module industry-grade upgrade. Competitor grounding:
Zendesk / Freshdesk / Intercom (ticket states, priority badges, conversation
timeline), Jira Service Management (filter chips, status grammar),
ServiceNow (escalation surface). Research note: web-search tool was
unavailable this session; patterns from established product knowledge.

## Already present (before this round)

- Zammad adapter (`src/modules/integrations/zammad.ts`): token-auth REST,
  20s abort, automatic end-user resolve-or-create, ticket creation
- Two surface routes: list and create (`src/app/api/v1/support/tickets/route.ts`)
- Server page renders a tolerant shell that surfaces "helpdesk
  unreachable" without erroring the page
- Permission check inherited from the global `route` helper; helpdesk
  cannot be enabled unless Zammad is configured
- E2E negative case: unconfigured helpdesk returns 400 cleanly

## Improved this round

- **Stats strip** — four tiles (total / open / escalated / closed). The
  open tile aggregates `new`, `open`, `pending reminder`, `escalated` to
  match the Zammad state machine; escalated has its own danger tone
- **State filter + search** — search by title or numeric id, filter by
  state, both compose. Mirrors Zendesk's queue grammar
- **Priority badge** — color-coded per priority level (low neutral,
  normal brand, high amber, urgent red). Both Zammad's `2 normal` style
  and the bare `normal` style are recognized
- **Recents strip** — the four most recently opened tickets, persisted
  to `localStorage["wamiro-support-recents"]`. Survives nav, click
  re-opens
- **Updated-at hint** — when an updatedAt is present and differs from
  createdAt, the row shows "updated Nm ago" so readers see whether
  something has actually moved
- **Inline detail panel** — click a row to expand a panel below it that
  shows the ticket metadata + the customer-visible article timeline
  (filtered to exclude internal notes). The customer messages get a
  brand-tinted card; agent messages stay neutral

## New this round

- **`GET /api/v1/support/tickets/[id]`** — single-ticket view with
  customer-scoped authorization (returns 404 if the requesting user is
  not the customer on the Zammad side, so ticket existence is not
  leaked across accounts). Filters out `internal: true` articles so
  customers never see private agent notes
- **`getTicket` in the Zammad adapter** — encapsulates the three-step
  fetch (ticket → user → articles) with the ownership re-check
- **Ticket detail contract** — `TicketDetail` exported interface so
  the client doesn't have to redeclare the shape
- **Updated-at projection** — list endpoint now exposes `updatedAt` so
  the UI can surface "last activity" without re-fetching each row

## Verification

- `npm run typecheck` clean
- `npm run lint` 0 errors (12 warnings pre-existing)
- Full E2E: **59/60 passing** (the "tickets endpoint reports unconfigured
  cleanly" step still green; the new GET [id] is exercised manually)
- Manual visual check: with helpdesk unconfigured, the "Helpdesk not
  connected" empty state is still the only thing rendered; once
  configured, the page renders the stats strip + new-ticket form +
  queue card with the new filter controls

## Backlog (not in this round)

- Reply-from-Wamiro — currently the page surfaces IT status and
  intentionally stops short of letting customers reply in-app. A
  `POST /tickets/[id]/articles` route could be added if/when a
  Wamiro-side comment thread is wanted, but the helpdesk remains the
  system of record
- SLA breach per ticket — Zammad exposes `first_response_at` /
  `close_at`; surfacing breach warnings would require another column
  pass
- Inline attachment upload when creating a ticket — Zammad supports
  multipart on the article API; the page currently captures title +
  body only
- Ticket list polling — the support page is server-rendered; live
  updates could be added later via the existing polling infra used by
  other modules
