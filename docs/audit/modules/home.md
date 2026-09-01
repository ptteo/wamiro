# Module Excellence Checklist — Home

Program: module-by-module industry-grade upgrade. Competitor grounding:
BambooHR (quick actions, who's-out), Rippling (task-driven home), HiBob
(feed/widgets), Microsoft Viva (aggregated personal dashboard),
Workday (manager pulse with persona tabs), Lattice (recognition feed),
Linear / Notion (command palette + minimal hero), HiBob (greeting +
personal status card), Height.app (timeline dot + vertical rail).
Research note: web-search was unavailable; patterns drawn from
established product knowledge of these 2025 home experiences.

## Already present (m1 + m14 r1 + m14 r2)

- Persona-derived sections (executive/HR/manager/admin/employee) from effective permissions — R4
- Greeting header with role line + department (§12/§13)
- Clock in/out quick action with open-shift awareness
- Needs-your-attention hero panel (m14 r1)
- This-week 5-day mini-calendar (m14 r1)
- Multi-domain activity timeline (m14 r1)
- Date-aware greeting (m14 r1)
- Personal status: hours today, streak, next holiday (m14 r2)
- Pulse card with persona tabs (m14 r2)
- 3-zone hero with identity + attention + quick actions (m14 r2)
- Click-through stat tiles (m14 r2)

## Improved this round (m14 r3 — full redesign)

The m14 r2 page tried to be a "dashboard of widgets" with a 3-column
hero, a 3-column main grid, persona tabs, command bar, and a kbd-shortcut
quick-action list. It looked busy, the boxes felt suffocated, and the
left rail competed with the right rail. This round rebuilds the page
from first principles around one rule: **one section per user intent,
not per data source**.

### Layout — 2-column on desktop, 1-column on mobile, sticky rail

```
┌────────────────────────────────────────────────────────────────────┐
│  Greeting row — avatar + "Good morning, Asha" + status pill +    │
│  clock-in pill (one row, max 80px tall)                          │
├────────────────────────────────────────────────────────────────────┤
│  Attention (only if items exist) — single column, no card chrome  │
│  with "You're all set ✓" empty state                              │
├──────────────────┬─────────────────────────────────────────────────┤
│  STICKY RAIL     │  CANVAS                                        │
│  ────────         │  ───────                                        │
│  Pulse (1 row)  │  THIS WEEK — 5-day strip, 2-col grid on tablet  │
│  Quick actions  │  ACTIVITY — vertical timeline with dots        │
│  Holiday note   │  ANNOUNCEMENTS — one-line list, max 3          │
│                  │                                                 │
│  (320px wide,    │  (flex, takes the rest, max 1200px)            │
│   sticky on      │                                                 │
│   desktop)       │                                                 │
└──────────────────┴─────────────────────────────────────────────────┘
                  Mobile bottom action bar — fixed, 4 chips
```

### What's new

| Section | Treatment |
|---|---|
| **Greeting row** | One row. Avatar (44px) + "Good morning, Asha" + meta line below. To the right: a status pill ("3h 12m today · 4-day streak · 4 days to Thanksgiving") when there's something to brag about, plus the clock-in pill |
| **Attention** | Renders only if `attention.length > 0`. Three rows max, each: 28×28 icon tile (color-coded) + label + detail + count badge + chevron. Below: an inline "✓ You are all set" empty-state line — no card, no chrome |
| **Pulse** (rail) | Three real stat tiles in a tight 3-col grid with `gap-px` separators. The "You" tab is always shown; the "Team / HR / Company / Admin" tabs are nested in a `<details>` disclosure so they don't steal the first viewport |
| **Quick actions** (rail) | Pill row, not a list. Each pill is `border + rounded-full + px-3 py-1.5`. No kbd shortcuts (they were unbacked in r2) |
| **Holiday note** (rail) | Only renders if a holiday is in the user's current week. Renders as a small warning-toned card |
| **This week** (canvas) | Five 1×1 cells, each 1px-rounded-rectangle. Today has brand-subtle background + brand-text date. Holiday: warning-subtle. User-out: brand text "You". Teammates out: stacked avatar initial chips |
| **Activity** (canvas) | Vertical timeline with a 1px gray rail + 2.5×2.5 colored dot at each event. One line per event: actor (bold) + verb (gray) + detail (gray) + time (right-aligned, monospace, compact) |
| **Announcements** (canvas) | One line per announcement: 🔔 icon + title + locale date. No card chrome — just a top border. Empty state: "No announcements yet — when the company posts an update, it shows up here." |
| **Mobile bottom bar** (new) | Fixed bottom nav on `< lg` screens with 4 quick action labels. Hidden on desktop. Always within thumb reach |

### What's removed

- The kbd-shortcut hints on quick actions (they were unbacked)
- The 3-column hero card (replaced with the cleaner greeting row)
- The "Today at a glance" tile grid in the middle (duplicated Pulse)
- The "Who's out today" panel as a separate section (folded into
  This week as a per-day "out today" hint)
- The "Recognition" panel as a separate section (folded into Activity
  with a `💝` / `🌟` icon)
- The personal-status cells inside the hero (lifted into the status
  pill in the greeting row)
- The command bar (it didn't have a real search target)

### Information design rules (applied)

- **One source of truth per metric.** "Open tasks" appears in Pulse and nowhere else. Manager-only metrics live in the Team tab of Pulse. No more "Today at a glance" duplicate.
- **No card chrome on dense lists.** Activity and Announcements are native HTML lists. Cards are reserved for "this is a self-contained piece of information" (Pulse, Quick actions).
- **Tone-coded color only on status, not on chrome.** Red = needs action, amber = approaching threshold, brand = primary, neutral = default. Used on stat numbers, not on borders.
- **Compact relative time everywhere.** "5m / 2h / yesterday / 3w / Nov 19" — same format on the activity timeline, attention rows, and recognition feed. No more "toLocaleString" everywhere.
- **Empty state is a sentence, not a card.** "No announcements yet — when the company posts an update, it shows up here." takes 1 line. A card with an icon and two lines of copy takes 80px.

### Responsive rules

| Width | Layout |
|---|---|
| `< 640px` (mobile) | Single column. Greeting row → Attention → Pulse → Quick actions → This week → Activity → Announcements. Bottom action bar visible |
| `640px - 1024px` (tablet) | Single column, same as mobile, but wider cells. Pulse tiles spread to 4-up. Bottom action bar visible |
| `≥ 1024px` (desktop) | 320px sticky rail on the left + flexible canvas on the right. Pulse and Quick actions live in the rail. The canvas is `min-w-0` so it can shrink to 0 without breaking the page. Bottom action bar hidden |

## Code

- `src/app/(app)/home/page.tsx` — rewritten end-to-end as a single file
  with private subcomponents (`PulseTabs`, `PulseTile`, `QuickActionsPills`,
  `HolidayNote`, `SectionHeader`, `AttentionSection`, `WeekStrip`,
  `ActivityList`, `AnnouncementsList`, `MobileActionBar`)
- All old `src/components/home-*.tsx` files deleted
- All subcomponents are server-rendered (no `"use client"` needed)
  except the existing `ClockInButton` which was already client

## Service additions (carried over from m14 r2)

- `personalStatus` field on `HomeSummary` (hoursTodayMinutes /
  hoursTodayLabel / streakDays / nextHolidayName / nextHolidayIn /
  nextHolidayLabel)
- `computeStreak(orgId, userId)` helper

## Verification

- `npm run typecheck` clean
- `npm run lint` 0 errors (26 warnings, pre-existing or library-internal)
- Full E2E: **64/64 passing** (no regression)
- Manual visual check:
  - Desktop: greeting + status pill + clock-in → 1-3 attention rows
    → rail (Pulse + Quick actions + Holiday) + canvas (This week →
    Activity → Announcements)
  - Tablet: same single column, wider cells
  - Mobile: stacked, with fixed bottom action bar always visible

## Backlog (still open)

- **Real Cmd+K command palette** — search is now a placeholder; needs
  a result page wired to all four content domains
- **Sparklines on Pulse tiles** — a 7-day trend line on top of each
  stat would make the page feel alive
- **Empty state with primary action** — "No announcements yet" could
  have a "Post the first one →" button if you have permission
- **Save layout** (R5 prefs) — let the user pin / hide Pulse tabs
