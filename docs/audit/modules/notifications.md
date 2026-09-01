# Module Excellence Checklist — Notifications

Program: module-by-module industry-grade upgrade. Competitor grounding:
Linear (grouped + relative time + per-row actions), Notion (kind icon
+ left stripe), GitHub (icon + tone per type), Slack (unread badge on
the rail, mark-read inline), Hey (calm empty states). Research note:
web-search was unavailable; patterns drawn from established product
knowledge of these 2025 inbox patterns.

## Already present (before this round)

- Single in-app inbox at `/notifications` rendered as a flat list
- "Mark all read" button
- Unread count
- Per-row click navigates to the linked entity
- 50-item cap on `listMine`
- Server-rendered list

## Improved this round (m14 round 4 — full redesign)

The old page was a single flat list with no categorization, no
per-row actions (you had to click through to mark read), and dates
formatted as full `toLocaleString` timestamps ("11/19/2025, 9:42:13 AM")
that consumed half the row.

### New layout — grouped by time, type-icon + left stripe

```
┌───────────────────────────────────────────────────────────────┐
│  Notifications                              [All] [Unread · 3]│
│  3 unread of 12                          [✓ Mark all read]    │
├───────────────────────────────────────────────────────────────┤
│  TODAY                                                        │
│  ▌ 🔔 Leave approved                              2h  ✓        │
│  ▌ 📋 Request pending approval                   1h  ✓        │
│                                                               │
│  YESTERDAY                                                    │
│  ▌ 🟦 task.assigned — Build the admin shell        yesterday ✓│
│  ▌ 🟨 Announcement — All-hands tomorrow            yesterday  │
│                                                               │
│  THIS WEEK                                                    │
│  ▌ 🟥 Governance — Policy overdue                 3d          │
│                                                               │
│  EARLIER                                                      │
│  ▌ 🟦 Project — You were added to "Wamiro v2"     2w          │
└───────────────────────────────────────────────────────────────┘
```

### What's new

| Section | Treatment |
|---|---|
| **Time-grouped sections** | Today / Yesterday / This week / Earlier. Each section has an uppercase label. Items never repeat across sections. Capped at 100 items total (was 50) |
| **Type icon** (24px) | Each notification gets a 28×28 icon tile: brand for new, danger for governance, warning for announcements, info for assignments. Read notifications use a muted tile |
| **Left colored stripe** (3px) | A thin vertical bar on the left edge of each row, color-coded by type. Provides a scanline for the eye. Opacity drops to 40% when the notification is read |
| **Filter chips** | `All` / `Unread · N` toggle in the header. Mismatched filter shows a dedicated "no unread" / "nothing here" empty state |
| **Per-row mark-read** | A small `✓` button appears on hover to the right of the time. Click marks the row read without navigating away. Pending state shown with disabled button |
| **Inline unread dot** | A 6px brand-color dot in the top-right of the body, separate from the type icon. The type icon's bg-subtle vs bg-brand-subtle also gives a stronger read signal |
| **Compact relative time** | `5m / 2h / yesterday / 3d / 2w / Nov 19` — same format as Home. Hover for the full timestamp. Eliminates the 30-character `toLocaleString` strings |
| **Counter in the subtitle** | "3 unread of 12" / "All 12 read" / "Inbox zero" — gives the user a single glance at their inbox state |
| **Friendly empty states** | Inbox zero: check icon + "Inbox zero" + helpful hint. Filtered empty: a separate state for the All-filtered-empty case vs the Unread-filtered-empty case |
| **No card chrome on the list** | The list is a native `ul` with a thin border. No Card, no CardHeader. The list is the page |
| **`?q=` filter on the server** | Visiting `/notifications?q=leave` filters by title/body substring. Completes the home command bar (typing "leave" there now lands on a filtered list) |

### Code

- `src/modules/notifications/service.ts`
  - New typed `NotificationKind` union (12 canonical kinds + `system`)
  - New `markRead(ctx, id)` — marks a single notification read
  - New `listMineGrouped(ctx, { onlyUnread })` — single source of truth
    for the list query, supports the filter chip
- `src/app/api/v1/notifications/[id]/route.ts` (new) — `PATCH { action: "read" }`
- `src/components/notifications-client.tsx` — rewritten end-to-end as
  a server-rendered shell + the client component on top. Grouping,
  filtering, type mapping, per-row mark-read, mark-all, empty states
- `src/app/(app)/notifications/page.tsx` — now a thin server wrapper
  that reads `?q=`, applies the substring filter, and passes a flat
  list to the client. Max content width 820px (notifications are
  inherently narrow)

### Type icon + stripe mapping

| Kind | Icon | Stripe | Notes |
|---|---|---|---|
| `leave` | Calendar | brand | leave.requested / .approved / .rejected |
| `request` | Receipt | warning | request.created / .approved / .rejected / .step_pending |
| `task` | ListTodo | info | task.assigned |
| `project` | ListTodo | info | project.member_added |
| `team` | UserPlus | info | team.member_added |
| `announcement` | Megaphone | warning | broadcasts |
| `asset` | Wallet | info | asset.assigned |
| `automation` | Zap | info | automation.matched |
| `governance` | CircleAlert | danger | overdue obligations |
| `recognition` | Sparkles | warning | kudos |
| `ai` | Sparkles | brand | AI result |
| `system` | Settings2 | tertiary | platform events |

Legacy `dot.prefixed` kinds (`leave.requested`, etc.) are kept in the
icon map for forward-compatibility — they map to the same icons by
stripping the suffix.

## Design decisions worth noting

| Decision | Why |
|---|---|
| **Group by time, not by type** | Linear, Notion, GitHub all group by time. The user thinks "what happened today" not "show me all leave events". A type-grouped inbox is a power-user feature; a time-grouped one is for everyone |
| **No card chrome on the list** | The list IS the page. Wrapping it in a Card + CardHeader added two lines of meta that nobody reads |
| **No "view all" / no pagination** | Capped at 100. Anything older is in the archive. If we exceed 100 in a single user's inbox, the right answer is a better filter, not infinite scroll |
| **Mark-all-read stays as a header button** | The per-row mark-read is the new granular control, but "I just want to clear everything" is still a one-click action |
| **Per-row mark-read lives in the hover state** | The button appears on `group-hover` so the default row stays clean. A user who's scanning doesn't see buttons everywhere; a user who's targeting a row sees the action |
| **Stripe opacity drops on read** | A read notification still shows its type color but at 40% — so the type signal is preserved but the urgency is muted |
| **Server-rendered `?q=`** | The home command bar now actually has a real result page. Substring filter on title + body is simple, fast, and good enough for v1 |
| **No keyboard nav this round** | Linear's j/k/e/u is great but the data model needs more work (cursor for "next unread", bulk-select state). Put in backlog |

## Verification

- `npm run typecheck` clean
- `npm run lint` 0 errors (28 warnings, pre-existing or library-internal)
- Full E2E: **64/64 passing** (no regression)
- Manual visual check: open `/notifications` — see the grouped list with
  type icons, stripes, filter chips, hover-revealed mark-read buttons.
  Click `Unread` to see only unread. Click the row to navigate; the row
  also marks itself read. Click the `✓` button to mark read without
  navigating. Click `Mark all read` to clear everything

## Backlog (still open)

- **Keyboard navigation** — j/k to move, e to archive, u to mark read
  (Linear-style). Needs cursor state in the client
- **Bulk select** — checkbox per row, "Archive selected" / "Mark selected
  read". Power-user feature
- **Notification preferences** — let users turn off kinds they don't
  care about (per-user setting)
- **Server-side search** — full-text index on title + body, not just
  substring match
- **Snooze** — "remind me in 1 hour" (Linear pattern)
- **Push notifications** — browser Notification API integration
- **Real-time updates** — SSE or polling for new notifications without
  a page refresh
