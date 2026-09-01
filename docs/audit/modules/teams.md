# Module Excellence Checklist — Teams

Program: module-by-module industry-grade upgrade. Competitor grounding:
Microsoft Teams (channels + member cards), Slack (workspace sidebar +
member list), Linear (team pages with stacked avatars), Notion
(workspace cards), GitHub (org teams with member grid). Research note:
web-search was unavailable; patterns drawn from established product
knowledge of these 2025 team workspaces.

## Already present (before this round)

- Create / rename / delete teams (permission: `teams.manage`)
- Add / remove members by email
- Member name list (plain text pills)
- `team.member_added` notification on add
- Audit: `TEAM_CREATED`, `TEAM_MEMBER_ADDED`, `TEAM_MEMBER_REMOVED`, `TEAM_DELETED`
- Org-scoped team listing

## Improved this round (m14 r7 — teams redesign)

The old teams page was a single list — one row per team, members as
plain text pills, "Manage members" toggled an inline form, "Delete"
sat next to it. Functional but flat. This round rebuilds it.

### Layout

```
┌───────────────────────────────────────────────────────────────┐
│  Teams                                                       │
│  Cross-department groups of people working together.          │
│  🔍 Search team or member…                  [+ New team]    │
│  5 teams                                                     │
│                                                               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│  │ Customer …  ⋯│ │ Hiring       ⋯│ │ Onboarding   ⋯│        │
│  │ 8 members    │ │ 4 members    │ │ 6 members    │         │
│  │ led by Ravi  │ │ led by Maria │ │ led by Asha   │        │
│  │ ⓐⓐⓐⓐ+3 [View]│ ⓐⓐⓐ+0 [View] │ ⓐⓐⓐⓐ+1 [View]│        │
│  ├──────────────┤ ├──────────────┤ ├──────────────┤         │
│  │ (expanded)  │ │              │ │              │         │
│  │ ⓐ Ravi K.   │ │              │ │              │         │
│  │   Manager   │ │              │ │              │         │
│  │   ✕         │ │              │ │              │         │
│  │ ⓐ Maria …   │ │              │ │              │         │
│  │   Designer  │ │              │ │              │         │
│  │   ✕         │ │              │ │              │         │
│  │ [+ Add by email]            │               │         │
│  └──────────────┘                                             │
└───────────────────────────────────────────────────────────────┘
```

### What's new

| Section | Treatment |
|---|---|
| **Grid of team cards** | 1-col on mobile, 2-col on tablet, 3-col on desktop. Each card is a self-contained, scannable unit |
| **Stacked avatars** | 5 avatars max with overlap, then a "+N" overflow chip. 2px surface-color ring around each avatar so they read as a stack. Each avatar is a link to the person's profile |
| **Lead indicator** | The alphabetically-first member is shown as the "Lead" with a link in the card header. Pattern borrowed from Linear's team pages — gives the user an immediate answer to "who runs this team?" |
| **Inline expand** | Click "View" on a card → it expands in place to show the full member list. No page navigation. The selected card is highlighted with a brand-tinted border + ring |
| **Member row** | In the expanded list: avatar + name (link to profile) + job title. The "✕" remove button only shows when the user has `teams.manage` |
| **Add by email** | A small input row at the bottom of the expanded card. Submit adds the member; the form clears itself; the card refreshes. Uses the existing `/teams/[id]/members` POST endpoint |
| **Destructive action in a "⋯" menu** | "Delete team" no longer sits next to the safe action. It's behind a `⋯` menu in the top-right of the card. The button only appears on hover (or always-on for keyboard users via `data-open`) |
| **Live search** | 250ms debounced URL update. Matches team name OR any member's name or email. No "Apply" button |
| **No team lead / lead inline** | A team with 0 members shows a "No members yet" inline row, with the "Add by email" form right below |
| **Empty state** | When the user has no teams yet, the grid is replaced by a single friendly card with a "Create your first team" CTA. When a search returns nothing, a "No teams match your search" card with a "Clear search" button |
| **Header `New team` button** | Lives in the toolbar, only visible when the user has `teams.manage` AND there are already teams (the empty-state card has its own CTA) |
| **Card click behavior** | The whole card is NOT a link (per Material 3 / Apple HIG / GitHub pattern). The View button is the affordance for the expand. Card actions stay in the card |

### Code

- `src/modules/teams/service.ts` — `TeamRow` now includes `lead`,
  `previewMembers`, and a `members` array of full `TeamMember`
  records. `listTeams()` runs a single SQL pass that returns each
  team with a JSON array of member objects (id, name, email,
  avatarUrl, jobTitle). No more name-only strings
- `src/components/teams-client.tsx` — fully rewritten. `NewTeamForm`
  and `AddMemberForm` as subcomponents. The whole page is now
  client-side (URL debouncing, local state for open card + menu)
- `src/app/(app)/teams/page.tsx` — thin server wrapper, `Content width="wide"`
  for proper card width, `PageHeader` for the title + subtitle

### Design decisions worth noting

| Decision | Why |
|---|---|
| **Grid, not a list** | Teams are a small set (most orgs have <50). A grid lets the user scan all teams at once. A list with all details would be 2-3× taller per row |
| **Stacked avatars instead of name pills** | A 30-person team would need 30 name pills (5 lines). Stacked avatars show 5 max + "+N" — instant read of "this is a big team". Click to expand for the full list |
| **Lead is the alphabetical first member** | The teams table doesn't have a `createdBy` or `leadUserId` column. The alphabetical-first member is a stable, defensible fallback. When we add a proper lead column in a follow-up migration, the service will just pick that one and nothing else changes |
| **Expand in place, not a detail page** | A team detail page is a separate URL, a separate navigation event, and another page that needs to be designed. Expand-in-place is the Linear/Notion pattern: click "View", the card grows, the rest of the page scrolls naturally. No new page to design |
| **Destructive action in a `⋯` menu** | A red "Delete" button next to the safe action trains the eye to ignore it. In a menu it stays out of the way until you need it. The menu only shows on hover for mouse users, but `data-open` makes it always visible when the menu is open (so keyboard users can see the result) |
| **Live search with URL debounce** | Same 250ms pattern as the directory. The page is shareable + back-button friendly. No submit button. The `×` clear button is right there in the input |
| **`Content width="wide"`** | The teams grid needs the room. A narrower content width would force 1-col on most laptops |
| **No `getProfileById` / no per-team detail page** | That's a separate effort. The expand-in-place is good enough for v1. A future round can add `/teams/[id]` for sharing / deep linking |
| **Card is not a link** | The "card is a button" pattern breaks down when the card contains its own action buttons (View, ✕, +). The whole card being a link causes the inner buttons to fight with the outer link. Better to have an explicit "View" affordance and a separate menu for delete |

## Verification

- `npm run typecheck` clean
- `npm run lint` 0 errors (35 warnings, pre-existing or library-internal)
- Full E2E: **64/64 passing** (no regression; teams-related E2E steps
  all green)
- Manual visual check: open `/teams` — see the grid of cards with
  stacked avatars. Click "View" on any card to expand the member
  list. Type in the search to filter. Hover a card to reveal the
  `⋯` menu; click it to see the delete option

## Backlog (still open)

- **Team detail page** — `/teams/[id]` for sharing + deep linking.
  The expand-in-place is good for v1, but a dedicated page would let
  the team lead see activity, projects, and pinned docs
- **Team lead column** — the `teams` table needs a `leadUserId` (or
  `createdBy`) column to make the lead a real concept, not an
  alphabetical proxy
- **Team description** — one-line description shown in the card header
- **Team color/icon** — pick a color or icon at creation, render as
  a 3px top border on the card
- **Member search inside the expanded card** — when a team has 50+
  members, the expanded list needs its own search
- **Reorder members** — drag-and-drop to set a custom display order
- **Bulk add** — paste a list of emails to add many at once
