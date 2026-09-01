# Module Excellence Checklist — Workplace

Program: module-by-module industry-grade upgrade. Competitor grounding:
Robin / Envoy (rooms + visitors on one page, "busy now" labels), OfficeRnD
(kind filter, today's timeline), Teem (org-wide day timeline, conflict-
aware booking). Research note: web-search tool was unavailable this
session; patterns from established product knowledge.

## Already present (before this round)

- D14 service `src/modules/workplace/service.ts` covering resources,
  bookings, and visitors, all tenant-scoped
- Conflict-checked booking with human-readable 409 (§9); cannot double-
  book a resource
- Visitor lifecycle: invited → checked_in → checked_out / cancelled;
  only `workplace.manage` may cancel, but hosts may check their own
  visitors in and out
- Per-kind resources (room / desk / resource) with capacity and
  features JSON column
- Three API routes (`/resources`, `/bookings`, `/visitors`) used by E2E
  to prove: room create → book → conflict 409 → cancel; visitor invite
  → checkin → checkout

## Improved this round

- **Dedicated `/workplace` page** — D14 had full APIs but no first-class
  UI surface; the page brings resources, bookings, and visitors into one
  workspace
- **Stats strip** — four tiles: my bookings today, visitors today (with
  "N on-site" hint), free rooms now, active resources. Surfaces the
  three most common questions on the way into the office
- **Org-wide day timeline** — `orgBookingsOn(day)` projects every
  org-booked slot for the current UTC day, sorted ascending. People can
  see who has what room without walking over
- **Resource list with kind filter** — Room / Desk / Resource filter
  matches the kind taxonomy, mirrors the rooms-desks pattern in
  OfficeRnD
- **Inline booking form** — each active resource expands to a tiny
  date/start/end form (one click to book, no nav). Conflict feedback
  from the 409 propagates as the inline error pill
- **"Free now" / "busy now" badge** — derived by comparing the resource
  list against the day timeline. Surfaces real-time availability
- **Recents strip** — `localStorage["wamiro-workplace-recents"]` (top
  4) mirrors the Knowledge and Documents pattern
- **My bookings with future/past split** — past bookings are rendered
  neutral; future ones are brand; cancel button only shows on
  future+booked
- **Visitor invite + tabbed list** — single form on the left; on the
  right, three tabs (today / upcoming / all) with status-coded badges
  and inline check-in / check-out / cancel actions
- **Visitor host name projection** — `myVisitors` now joins users so
  the org-wide visitors list shows who is hosting each guest

## New this round

- **`orgBookingsOn(ctx, day)` service** — UTC-day-windowed overlap
  query against `workplaceBookings`; reusable from any future
  calendar UI
- **`WorkplaceClient` component** — single-source-of-truth client
  for the page, all four sub-views inside one React tree
- **`isPast` derivation** — `endsAt < now` derived on the client so
  the API contract stays simple

## Verification

- `npm run typecheck` clean
- `npm run lint` 0 errors (12 warnings pre-existing)
- Full E2E: **59/60 passing** (no regression; the four D14 E2E steps
  for room, conflict, cancel, and visitor lifecycle still green)
- Manual visual check: navigate to `/workplace`, see four tiles,
  open a room, book a slot, see the booking appear under "My
  bookings" and on the day timeline; invite a visitor, see them
  in the today tab, check them in (badge turns green), check them
  out

## Backlog (not in this round)

- Floor plan / map view — would require asset uploads of SVG
  plans and a drag-to-position UI
- Recurring bookings — currently a one-shot. A weekly/monthly
  repeat pattern would be high-value for staff meetings
- Per-resource capacity rules (e.g. no overlapping bookings that
  exceed total seats) — the booking check is per-resource; a
  capacity-aware rule would need a config column
- Outlook / Google Calendar two-way sync — D14 stays the
  system of record but a calendar push would reduce double-book
  against external meetings
- Visitor badge printing — would tie the visitor to a printable
  badge with a QR code referencing the visitor id
