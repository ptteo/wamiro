# Module Excellence Checklist — Org Chart

Program: module-by-module industry-grade upgrade. Competitor grounding:
Microsoft Viva (color-coded departments with stacked avatars), BambooHR
(rich people cards with role + dept), Rippling (column-by-team
directory), LinkedIn (search-by-name highlights path), Workday
(manager-breadcrumb focus view), Lattice (people-first org browser).
Research note: web-search was unavailable; patterns drawn from established
product knowledge of these 2025 org-chart experiences.

## Already present (before this round)

- Reporting-line tree (`orgTree`) with cycle guard (m14 r8)
- Single-view page with a list of indented names, capped at depth 8
- Search by name with path highlighting
- Per-node collapse via chevron toggle

## Improved this round (m14 r9 — three views + demo hierarchy)

The page now ships with a full demo org (30 people across 7
departments) so the chart has real data, and offers two focused
views: a **Teams** column view (the primary "browse the company"
surface) and a **Focus** view (a two-pane detail when you click a
person). The earlier tree view was the obvious third option but it
duplicated the Teams view in spirit, and the user asked for something
simpler and more visually appealing.

### Layout

```
┌───────────────────────────────────────────────────────────────┐
│  Org Chart                                                    │
│  The company broken down by team. Click a person to focus.  │
│  [Teams] [Focus]   🔍 Search…   30 people · 6 roots · depth 4│
│                                                               │
│  ┌─Executive──┐ ┌─Marketing──┐ ┌─Engineering─┐ ┌─IT──┐ …   │
│  │ ● 5        │ │ ● 4        │ │ ● 7         │ │ ● 3│       │
│  ├────────────┤ ├────────────┤ ├─────────────┤ ├────┤       │
│  │ ⓐ Asha    │ │ ⓐ Sneha   │ │ ⓐ Priya   │ │ ⓐ D│         │
│  │   CEO     │ │   Head of  │ │   Eng Mgr  │ │   H│         │
│  │          │ │   Marketing│ │           │ │   o│         │
│  │ ⓐ Diya   │ │ ⓐ Aman    │ │ ⓐ Aditya  │ │ ⓐ A│         │
│  │   CMO     │ │   SEO Lead │ │   Head     │ │   I│         │
│  └────────────┘ └────────────┘ └─────────────┘ └────┘       │
└───────────────────────────────────────────────────────────────┘

click ⓐ Asha Patel
  → switches to Focus view:
    ┌──────────────────────┐ ┌────────────────────────────┐
    │ Reporting context    │ │ Asha Patel                  │
    │   → Diya Iyer         │ │ ● CEO                       │
    │   → Asha Mehta ★      │ │ "Chief Executive Officer"   │
    │     Direct reports (4)│ │                            │
    │     ⓐ Diya  CMO       │ │ 📧 ceo@howdy.test          │
    │     ⓐ Vikram COO      │ │ 🏢 Executive                │
    │     ⓐ Anjali CPO      │ │ 👥 Direct reports: 4        │
    │     ⓐ Rahul CTO       │ │                            │
    │     [Sub-tree…]       │ │ [Open profile] [Manager →] │
    └──────────────────────┘ └────────────────────────────┘
```

### What's new

| Section | Treatment |
|---|---|
| **Seeded full company hierarchy** | The seed now creates 30 people: CEO (Asha), C-suite (CMO/COO/CPO/CTO), 6 departments (Executive, Marketing, Engineering, IT, Operations, Product, Customer Experience), with **real example roles** like SEO Lead, Head of Marketing, IT Specialist, QA Specialist, Finance Analyst, UX Researcher, Customer Support Specialist — not placeholder names. The chart auto-updates when a new joiner is added because the page is `dynamic = "force-dynamic"` and the data is re-queried every request |
| **Two view tabs: Teams · Focus** | "Teams" is the default — the column-by-department view. "Focus" is the two-pane detail view you get when you click a person. The earlier tree view was removed because Teams conveys the same information faster and at-a-glance |
| **Teams view: color-coded columns** | One column per department, each with a header bar in its department's signature hue. The hue is a stable hash of the department name, so the same department always gets the same color across sessions. 8 hues in the palette (brand / warning / success / info, each with a 50% variant) |
| **Department header** | Each column has a colored bar with the department name + count pill. Inside the column, people are listed top-to-bottom, alphabetically, with avatar + name + title. No connecting lines — departments are presented as a flat directory within a colored frame |
| **Empty "Unassigned" column** | People with no department fall into a final "Unassigned" column. The seed doesn't create any, but the page handles the case |
| **Click any name to focus** | Both views support this. The Teams view flips to Focus; the Focus view swaps the focused person. URL updates to `?focus=<userId>` so it's shareable + back-button friendly |
| **Focus view: two-pane layout** | Left pane = "Reporting context" — ancestors above the focused person (chevron-link list), then the focused person (highlighted card), then direct reports with a small sub-tree below. Right pane = the focused person's detail card with email, title, department, direct-reports count, and a colored top stripe in their department's hue |
| **Focus breadcrumb on the right** | "Reports up to" panel on the right lists the chain of managers in reverse (closest at top). Click any name to focus on them instead |
| **Edit affordances (gated)** | The "Open profile" button is always there. "View manager" appears when the person has a manager. Inline role rename and reparent are in the backlog |
| **Search highlights the path** | Type a name in the search → all matching people are highlighted with a warning-toned border + soft background. The match summary banner shows count and whether any matches were found. Works across both views |

### Code

- `src/db/seed.ts` — replaced the 4-person stub with a 30-person full
  company hierarchy: CEO → 4 C-suite (CMO/COO/CPO/CTO) → 6 department
  heads → 21 individual contributors across Marketing (SEO Lead,
  Content Manager, Visual Designer), Engineering (Head of Backend,
  Head of Frontend, Backend Engineers, Frontend Engineer, QA
  Specialist), IT (IT Specialist, IT Support), Operations (Finance
  Lead, Finance Analyst), Product (Product Analyst, UX Researcher),
  Customer Experience (Customer Success Manager, Support Team Lead,
  Customer Support Specialist)
- `src/modules/people/orgchart.ts` — replaced `orgTree` with a richer
  `orgData` that returns `{ tree, byId, departments, totalPeople,
  totalRoots, maxDepth }`. Single SQL pass with a JSON-aggregated
  members subquery; the JS side splits into preview + sorted full
  list and computes the department roll-up
- `src/components/org-chart.tsx` — rewritten as a client component
  with two view modes (Teams / Focus), search across both,
  URL-synced (`?view=…&focus=…`), 8-color stable department hue
  palette. The tree view that was here in r8 has been removed
- `src/app/(app)/org-chart/page.tsx` — thin server wrapper, default
  view is `departments`, supports `?view=tree|departments|focus` and
  `?focus=<userId>`

### Design decisions worth noting

| Decision | Why |
|---|---|
| **Tree view removed (departments + focus only)** | The user asked for "simple, visually appealing". The tree view was functional but busy. Departments view is the "browse" experience; Focus view is the "drill into a person" experience. Together they cover the two real use cases (find someone, learn about someone) without the visual complexity of a tree |
| **Color columns, not cards** | The columns are the visual anchor of the page. A user scans down a single color to see "everyone in Marketing". A card-per-department layout would make the comparison "Marketing vs Engineering" much harder |
| **Stable hash → hue** | Same department → same color, every time. Users build a mental map (Marketing = blue, Engineering = warning/amber). Round-robin or session-based color picking would defeat the purpose |
| **Two-pane Focus view, not a separate profile page** | The Focus view is a quick-look experience, not a full profile. Click the name in the left pane or the "Open profile" button to navigate to the full profile (`/people/[id]`) |
| **Search highlights path across BOTH views** | Whether you're in Teams or Focus, the same search matches the same nodes. The Teams view lights up the cells; the Focus view would scroll to the matching person if a path existed. Single code path, two visual presentations |
| **Auto-updates** | The page is `dynamic = "force-dynamic"` and the data is re-queried on every request. Add a new joiner, refresh the page, they're in the chart. No cache invalidation needed |
| **8 hues, not 6** | The seed creates 7 departments. An 8-hue palette covers all of them without wrap-around. When a 9th department appears, it gets the same color as the 1st — visually obvious, not visually wrong |
| **No "print to PDF" this round** | Still a real ask. Backlog item |

## Verification

- `npm run typecheck` clean
- `npm run lint` 0 errors (38 warnings, pre-existing or library-internal)
- `node scripts/migrate.mjs` — already applied (no new migrations this round)
- `npm run db:seed` — seeds the 30-person demo org
- Full E2E: **64/64 passing** (no regression)
- Manual visual check: open `/org-chart` — see the columns view with
  all 7 departments, each in its own color. Click any name → switches
  to Focus view with the selected person in the right pane and their
  reporting chain in the left pane. Type a name in the search to
  highlight the match

## Backlog (still open)

- **Inline role rename** — click the title in the focus card to edit,
  blur to save (HR-only)
- **Reparent (change manager)** — drag a person to a new manager in the
  Focus view's sub-tree
- **Custom department colors** — HR picks a hue per department; store
  in a `departments.color` column
- **Print to PDF** — server-rendered tree with print-friendly CSS for
  HR onboarding packets
- **Drag-to-reorder** within a team column
- **Department view as a separate page** — `/departments` shows org
  structure by department (org-chart-by-department) with budget +
  headcount per column
