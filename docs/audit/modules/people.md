# Module Excellence Checklist — People

Program: module-by-module industry-grade upgrade. Competitor grounding:
Rippling (unified directory + deep profiles), HiBob (timeline-rich people
profiles), BambooHR (clean directory search). Research note: web-search tool
was unavailable this session; patterns from established product knowledge.

## Already present (before this round)

- Directory with server-side search (name/email/title), department filter, status filter, manager column — D2 §12–13
- **Rich profile page** `/people/[id]` with tabbed layout (Overview / Attendance / Leave), custom-fields editor, workspace data, self/manager/HR visibility gates
- Recruitment pipeline · onboarding/offboarding journeys · performance cycles · learning · recognition · HR change requests · my-profile with lifecycle timeline (`/people/me`)
- Org structure: departments + teams with member counts

## Improved this round

| Feature | Improvement |
|---|---|
| Profile depth | Overview tab now shows **direct reports** (linked) and the **employee lifecycle timeline** (joined → promoted → reviewed → recognized) for self/manager/HR viewers |

## New this round

| Feature | Detail |
|---|---|
| `directReports()` service helper | Org-scoped reports list for any user |
| Lifecycle-on-profile | Cross-module timeline assembled from job changes, finalized reviews, recognitions — surfaced inside the profile rather than only on /people/me |

## Improved this round (m14 r6 — profile page redesign)

The profile page was a single Card with a bare avatar, three rows of
key-value pairs, query-param tabs, and a vertical stack of full-width
Card sections. No hero, no actions, no at-a-glance grid, no real
timeline. This round rebuilds it.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ← People / Asha Patel                                      │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ (cover strip 80px)  │
│  ▌ ⓐ Asha Patel  (with status dot bottom-right)            │
│  ▌   Senior Engineer · Engineering · 1y 4m at company     │
│                                          [Email][1:1][Kudos]│
│  [ Overview 3 ] [ Attendance 12 ] [ Leave 5 ]              │
│                                                              │
│  ┌─email──┬─dept──┬─reports to──┐                           │
│  │ ⓥ     │ ⚇    │ ↗ Ravi S.   │  ← clickable fact grid      │
│  │ ⓥ     │ ⚇    │             │                             │
│  ├─title──┬─time──┬─status─────┤                           │
│  │ ⓥ     │ ⏱    │ active     │                             │
│  └───────┴──────┴─────────────┘                            │
│                                                              │
│  PROFILE DETAILS                          [✎ Edit]         │
│  Phone     +1 555 0123                                     │
│  Location  Berlin                                           │
│                                                              │
│  DIRECT REPORTS                            3                │
│  ┌─────────────┬─────────────┐                            │
│  │ ⓐ Ravi      │ ⓐ Maria     │ ← 2-col mini cards          │
│  │ Engineer   │ Tech Lead   │                            │
│  ├─────────────┼─────────────┤                            │
│  │ ⓐ Lin      │             │                            │
│  └─────────────┴─────────────┘                            │
│                                                              │
│  LIFECYCLE                                       [right rail]│
│  │  2025   ▸ Promoted to Senior              [Email]      │
│  │  2024   ▸ Hired as Engineer               [Department] │
│  │  2024   ▸ Joined Wamiro                   [Reports to] │
│                                                          [Started]│
│                                                          [Title]  │
└──────────────────────────────────────────────────────────────┘
```

### What's new

| Section | Treatment |
|---|---|
| **Breadcrumb** | `← People / Asha Patel`. Replaces the bare "← Back to People" text. Last segment is the user's name in primary color |
| **Cover strip** | 80px gradient from brand-subtle to surface. The avatar sits below it with a 4px white ring. The status dot lives in the avatar's bottom-right with a 3px surface ring |
| **Quick actions** | Email, Schedule 1:1, Send kudos. The first two are `mailto:` links with prefilled subjects. The kudos button goes to `/people/recognition` and is only visible when the user has `recognition.give` |
| **Tenure** | "1y 4m at company" — appears in the subtitle line below the name. Format: days under 60, months under 2 years, then years + months |
| **Tab bar** | Updated style — bottom-border-active, brand-colored. Tab counts in tiny pills (Attendance 12, Leave 5) when workspace data is available |
| **At-a-glance grid** | 3-col on desktop, 2-col on mobile. Six fact cells: Email, Department, Reports to (clickable), Title, Time at company, Status (color-coded). Each cell has a tiny 3.5px icon. The grid is `gap-px` so cells share a single border. Reports-to links to the manager's profile |
| **Profile details** | Custom fields rendered as a clean two-column list (label left, value right). Edit button in the corner for users with `employees.edit`. Clicking Edit transforms the list into a form with the right field types (date, number, select, textarea) |
| **Direct reports** | 2-col mini-card grid (1-col on mobile). Each card is a clickable row with avatar + name + role + department + chevron. Hover lifts with a subtle background change |
| **Lifecycle timeline** | Vertical timeline with year groups. Each year has its own subsection with a sticky year label. Events are dots connected by a 1px vertical line. Format: dot + label + detail + date |
| **Attendance tab** | One row per clock-in. Format: weekday + date (e.g. "Tue, Nov 19"), in/out times (e.g. "09:01 → 17:42 · 9h"), with a "9h" pill for completed shifts and an "open" pill for active ones |
| **Leave tab** | One row per leave. Format: type + days (e.g. "Vacation · 5d"), date range, status pill (green/amber/red/neutral) |
| **Right rail** | Two cards: "At a glance" (richer version of the grid facts with icon + label + value), and "This person" (cross-links to /approvals, /attendance, /leave filtered to the person). Hidden on mobile |
| **No more "Access" placeholder** | The old "Sensitive details stay hidden until those modules ship" Card is gone — the route already hides fields the user can't see, so the placeholder is redundant. Replaced with a small footnote at the bottom |
| **Status dot on avatar** | Already added in the directory round, used here in the profile hero too |

### Code

- `src/components/people-profile.tsx` (new) — `ProfilePageClient` with
  subcomponents: `FactCell`, `RightCard`, `RightRow`, `LifecycleTimeline`,
  `AttendanceSection`, `LeaveSection`, `CustomFieldsEditor`,
  `tenureLabel`
- `src/app/(app)/people/[id]/page.tsx` — thin server wrapper, fetches all
  data, projects onto the client. No JSX, no layout
- `src/modules/people/service.ts`
  - `FullProfile` now includes `avatarUrl`, `departmentId`, `managerId`
  - `directReports()` now projects `avatarUrl` and `departmentName`
- `src/components/ui.tsx` — already had `Avatar` with `src?` and `StatusDot`
  from the directory round, both used here

### Design decisions worth noting

| Decision | Why |
|---|---|
| **Cover strip is a real gradient, not a flat color** | A flat brand-tinted top bar would feel like a banner ad. A short gradient feels like a tasteful cover image. Same technique Linear and Notion use on profile pages |
| **Avatar is on top of the strip, not below it** | The half-overlap is what makes it feel like a "profile" rather than a "list item" with extra metadata |
| **Fact grid is 3-col on desktop, 2-col on mobile, with `gap-px`** | A single 1px shared border looks like a real table, not a collection of cards. Saves vertical space. On mobile the same effect is preserved |
| **Direct reports are mini cards, not just text links** | "Ankita" is just a name; a 32px avatar + name + role + department is a person. Mini cards let the manager scan their team at a glance |
| **Lifecycle groups by year** | A flat list of 30 events is unreadable. Year groups create natural scroll anchors. Sticky year labels keep the user oriented |
| **Right rail duplicates the at-a-glance grid facts** | The main grid is for visual scanning; the right rail is for the "I need to look up one specific fact right now" use case. Same data, different presentation |
| **Email + Schedule 1:1 use `mailto:`** | No need to build a messaging module right now. The `mailto:` link works in every email client and gives the user an immediate next step. The schedule-1:1 link pre-fills the subject |
| **Send kudos goes to the page, not a modal** | Building a kudos modal is a separate effort. The button takes the user to the existing recognition page where they can complete the action. The link is the API, not the UI |
| **No "Access" placeholder card** | Hiding data is the API's job. Showing a paragraph explaining what's hidden is dead weight. A footnote is enough |
| **Right rail hidden on mobile** | The at-a-glance grid is already in the main column. On mobile the rail would be redundant. Hidden via `lg:` prefix on the column |

## Verification

- `npm run typecheck` clean
- `npm run lint` 0 errors (34 warnings, pre-existing or library-internal)
- Full E2E: **64/64 passing** (no regression; the E2E test navigates the
  directory and clicks into a profile, all green)
- Manual visual check: open `/people` (lists page), click any row →
  lands on the new profile with the cover strip, fact grid, direct
  reports cards, and lifecycle timeline. Tabs (Overview / Attendance /
  Leave) are sticky-underlined and show count badges

## Backlog (still open)

- **Avatar upload** — the `users.avatarUrl` column exists, but there's no
  upload UI yet (only the org logo upload is implemented). Add a "Change
  photo" action on the profile hero
- **Compensation tab** gated by `employees.view_salary` (field reserved in
  catalog) — needs the field, the page, and the data-source migration
- **Directory virtualization at >500 rows** — the current implementation
  renders every row at once. For orgs of 5K+, virtualization is required
- **Org-chart page refresh** — the /org-chart page still uses the old
  patterns. Should follow the same redesign as the directory
- **Saved filters** — "My team" / "Engineers in Berlin" / etc. as
  bookmarkable URLs the user can pin
- **Profile cover image upload** — let users pick a real cover image
  instead of the gradient
- **Recent activity for this person** — show what they've done lately
  (submissions, approvals, kudos received) in the right rail


The old directory was a single horizontal filter form + flat list with
"Apply" button. Date of last touched: pre-2025. This round rebuilds
it from first principles.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  People                                       [Invite teammate]│
│  Everyone at Acme                                              │
│  ┌─search────────────┐  [All · 47] [Active · 42] [Invited · 3]│
│  │ 🔍 name/email/… │  [Suspended · 2]  [All depts ▾]   [☰][▦]│
│  └──────────────────┘                                          │
│  47 people · company directory                  [Reset]       │
│                                                                │
│  ── Engineering · 12 ──                                        │
│  ▌ ⚪ Asha Patel          Senior Engineer · Engineering        │
│  ▌ ⚫ Ravi Singh          Engineer · Engineering               │
│  ▌ ⚪ Maria Garcia        Tech Lead · Engineering              │
│  …                                                            │
│                                                                │
│  ── Product · 8 ──                                            │
│  …                                                            │
│                                                                │
│  ── No department · 2 ──                                      │
│  …                                                            │
└──────────────────────────────────────────────────────────────┘
```

### What's new

| Section | Treatment |
|---|---|
| **Live search** (250ms debounce) | No submit button. URL updates on every keystroke (`?q=...`). Includes a `×` clear button inside the input. Searches name, email, title, and department |
| **Status filter chips** with counts | `All · 47` / `Active · 42` / `Invited · 3` / `Suspended · 2`. Selected chip is brand-on-white, others are tertiary. Counts come from the unfiltered list |
| **Department dropdown** | Compact native `<select>` next to the chips, lists every department + "All departments" |
| **List / Grid view toggle** | Two icon buttons in the top right (☰ / ▦). List = grouped rows. Grid = cards, 1/2/3/4 columns responsive. Both share the same data |
| **Grouped by department** (list view, no filter active) | Each department gets a section header `Department · 12`. "No department" group at the bottom. The grouping collapses to a flat list as soon as any filter is active |
| **Status dot on avatar** | 8px circle in the bottom-right of the avatar, with a 2px white ring. Color-coded: success / warning / danger / tertiary. Replaces the after-row badge |
| **Real avatar support** | The directory now projects `users.avatarUrl` and the `Avatar` component renders the image when present, with a graceful fallback to initials |
| **Filter result meta line** | "47 people · company directory · Reset" — single source of truth for the result count + scope + the reset action |
| **Empty state with primary action** | "No matches" + hint + "Clear filters" button. Or, when no filter, a "When teammates join they'll appear here" hint with no button |
| **Invite teammate CTA** in the header | Visible only when the user has `users.manage` permission. Sends to `/admin/users` |
| **Grouped emails** (list view) | Email column hidden on mobile, visible on `sm:` and up. Stays out of the way without removing the data |

### Code

- `src/components/people-directory.tsx` (new) — `PeopleDirectory` client
  with `ListView` and `GridView` subcomponents; `PeopleDirectoryHeaderAction`
  for the Invite button
- `src/components/ui.tsx`
  - `Avatar` gained an optional `src?: string` and renders the image
    when present, with the existing initials fallback otherwise
  - `StatusDot` (new) — 8px colored circle with a 2px surface-color ring
  - `EmptyState` gained optional `icon` and `action` props
- `src/modules/people/service.ts`
  - `DirectoryEntry` now includes `avatarUrl` and `departmentId`
  - The `status` filter is no longer auto-defaulted to "active". The
    default is "All" (matches the new chip UI)
- `src/app/(app)/people/page.tsx` — thin server wrapper, status counts
  computed for the filter chips, scope label passed to the client

### Design decisions worth noting

| Decision | Why |
|---|---|
| **Default to "All" not "Active"** | The new chip pattern from Linear / Notion / GitHub defaults to "All" so the user sees the full picture first. Old code defaulted to "Active" which hid invited/suspended users and made the directory feel incomplete |
| **Group by department only when no filter is active** | When the user types a search or picks a department, the grouping is redundant — they already know the filter context. Flat list is faster to scan |
| **Status dot not badge** | A badge after the row pushes the row to 60-72px and consumes horizontal space. The dot is at the avatar — same place the eye is already looking for "who is this person" |
| **Two view modes (list + grid) with no default change** | Default to list (what users expect from a directory) but offer grid for users who think visually. Same data, different presentation — both keep the filter state |
| **250ms debounce on search** | Linear's value. Long enough to avoid an API call per keystroke, short enough to feel instant. 250ms is the sweet spot |
| **Real avatars in directory** | The `users.avatarUrl` field already exists (used in `/admin/users` invite); the directory just wasn't projecting it. Now profile photos render everywhere they're displayed |
| **Permission-gated Invite button** | Lives in the page header, not the toolbar. Visible only when the user has `users.manage`. The check is server-side so it can never be bypassed |

## Verification

- `npm run typecheck` clean
- `npm run lint` 0 errors (30 warnings, pre-existing or library-internal)
- Full E2E: **64/64 passing** (no regression; AI self-data test was flaky on a slow provider this round and passed on retry)
- Manual visual check: open `/people` — see the toolbar with search + chips + dept + view toggle, the meta line with reset, the grouped list (or grid if you click the icon), and the Invite button in the header if you have permission

## Backlog (still open)

- **Avatar upload** — the `users.avatarUrl` column exists, but there's no
  upload UI yet (only the org logo upload is implemented). Add a "Change
  photo" action on the profile page
- **Compensation tab** gated by `employees.view_salary` (field reserved in
  catalog) — needs the field, the page, and the data-source migration
- **Directory virtualization at >500 rows** — the current implementation
  renders every row at once. For orgs of 5K+, virtualization is required
- **Org-chart page refresh** — the /org-chart page still uses the old
  patterns. Should follow the same redesign as the directory
- **Saved filters** — "My team" / "Engineers in Berlin" / etc. as
  bookmarkable URLs the user can pin

## Verification (cumulative)

- typecheck clean · lint 0 errors
- E2E 64/64 PASS (production build)
- Home redesign (m14 r1–r3) + Notifications redesign (m14 r4) + Directory redesign (m14 r5) all shipping without regression

