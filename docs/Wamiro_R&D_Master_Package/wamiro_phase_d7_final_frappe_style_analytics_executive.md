# WAMIRO — PHASE D7
## Analytics & Executive Workspace — Final Frappe-Style Redesign Specification

**Program:** Wamiro MNC-Grade UI/UX Transformation  
**Phase:** D7 — Analytics + Executive Experience  
**Prerequisite:** D1–D6  
**Primary instruction:** Redesign the existing D7 experience to follow the Frappe UI visual system and workspace structure as closely as possible, while **not introducing new product features**.

---

# 1. D7 FINAL RULE

This phase is a **redesign phase**, not a feature-expansion phase.

Do not add:

```text
new modules
new dashboard concepts
new AI features
new analytics features
new navigation domains
new workflows
new widgets
new business capabilities
```

Only redesign and structure the D7 functionality that already exists in Wamiro.

The goal is:

> **Make the existing Wamiro Analytics and Executive experience feel like it belongs to the same application family as Frappe UI.**

---

# 2. VISUAL TARGET

Use the supplied Frappe UI screenshots, design guidance and recipes as the primary visual reference.

The Wamiro UI must follow the same overall:

```text
font
font scale
color language
surface hierarchy
spacing
density
sidebar geometry
header geometry
table geometry
row height
border treatment
button treatment
badge treatment
icon treatment
alignment
```

Do not reinterpret the design into a different modern SaaS style.

Do not add decorative elements.

---

# 3. MOST IMPORTANT REQUIREMENT

The current Wamiro UI is too dashboard/card-oriented.

Move it toward the Frappe operational application model:

```text
Contextual workspace sidebar
+
compact page header
+
small number of controls
+
dense data/list/table content
+
strong alignment
+
minimal card usage
```

Do NOT create:

```text
large KPI card grids
large hero sections
large empty spaces
gradient panels
glassmorphism
neon effects
AI-looking dashboards
```

---

# 4. EXACT FONT

Use the same font family used by Frappe UI:

```text
InterVar
```

Do not introduce another application font.

Do not mix:

```text
Inter
Poppins
Roboto
Geist
Arial
```

inside the Wamiro application.

The UI should use one consistent font system.

---

# 5. TYPOGRAPHY

Follow the supplied Frappe typography model.

Use the two semantic typography roles:

```text
text-*
→ tight single-line UI content

text-p-*
→ multi-line/descriptive content
```

Application mapping:

```text
Headings
Buttons
Badges
Table cells
Single-line metadata
KPI values
Timestamps
```

use the tight text scale.

Use the paragraph scale for:

```text
Descriptions
Explanations
Helper text
Wrapped content
Long-form text
```

---

# 6. TYPOGRAPHY SCALE

Follow the supplied Frappe scale:

| Size | Use |
|---|---|
| 11px | micro labels |
| 12px | metadata / captions |
| 13px | secondary labels |
| 14px | default UI |
| 15px | dense section labels |
| 16px | section content |
| 17px | panel titles |
| 18px | page titles |
| 20px | prominent page title |
| 24px+ | not for normal operational UI |

Do not use oversized headings.

---

# 7. NO UPPERCASE

Never use:

```text
uppercase
tracking-wider
```

for normal headings, section headings, labels or table headers.

Use sentence case:

```text
Recent activity
Company overview
Project health
```

not:

```text
RECENT ACTIVITY
COMPANY OVERVIEW
PROJECT HEALTH
```

---

# 8. EXACT WAMIRO APPLICATION PALETTE

The D4-approved Wamiro application palette remains mandatory.

Use only:

```text
#7A7A7A
#F8F8F8
#242424
#D9D9D9
#999999
#BD660E
#171717
#383838
#AFAFAF
#C23838
```

Do not add other Wamiro UI colors.

Do not introduce:

```text
blue dashboards
purple analytics
green KPI systems
yellow warning systems
rainbow charts
```

---

# 9. COLOR SYSTEM

Build/use semantic tokens.

The Wamiro implementation should follow the Frappe semantic structure:

```text
text-ink-*
bg-surface-*
border-outline-*
```

Do not use raw palette classes such as:

```text
text-gray-900
bg-white
border-gray-200
```

when a Wamiro semantic token exists.

The semantic token layer is the application API.

---

# 10. LIGHT MODE

Light mode must use the approved palette and the same Frappe visual hierarchy.

Use:

```text
#F8F8F8
#D9D9D9
#AFAFAF
#242424
#383838
#7A7A7A
#999999
#BD660E
#C23838
```

Do not introduce a separate light-mode brand system.

---

# 11. DARK MODE

Dark mode must use the same approved palette family.

Primary dark surfaces:

```text
#171717
#242424
#383838
```

Light foreground/surface values:

```text
#F8F8F8
#AFAFAF
#999999
```

Accents:

```text
#C23838
#BD660E
```

The UI must remain visually consistent between themes.

Do not create blue/purple dark-mode replacements.

---

# 12. DARK MODE IMPLEMENTATION

Use:

```text
[data-theme="dark"]
```

or the existing Wamiro equivalent.

The same semantic token names should automatically resolve to their theme values.

Do not add page-by-page manual dark-mode color patches unless absolutely required by a component limitation.

---

# 13. RADIUS

Follow the supplied Frappe radius scale.

Primary application values:

```text
4px  → tiny tags/chips
8px  → buttons, inputs, list items
10px → cards
12px → dialogs/larger surfaces
16px → large surfaces
20px → marketing only
full → avatars/status dots/pills
```

Normal analytics UI should primarily use:

```text
8px
10px
12px
```

Do not make every container rounded.

---

# 14. SHADOW

Use shadows only where they establish elevation.

```text
shadow-sm → subtle card
shadow    → default elevated control
shadow-md → dropdown/popover
shadow-lg → dialog
shadow-xl → floating panel
```

Do not use large shadows throughout dashboards.

---

# 15. SPACING

Use the existing Wamiro spacing system based on the Frappe/Tailwind rhythm.

Target:

```text
sections → space-y-6
form fields → space-y-4
inline actions → gap-2
sidebar items → space-y-0.5
page top → pt-5 / pt-6
```

Do not invent arbitrary spacing values.

---

# 16. APPLICATION SHELL

Use the exact D1/D5/D6 architecture:

```text
RAIL
+
CONTEXTUAL SIDEBAR
+
PAGE HEADER
+
CONTENT
```

The rail is the major workspace switcher.

The sidebar is only for the active Analytics workspace.

---

# 17. ANALYTICS RAIL

The rail entry remains:

```text
Analytics
```

Clicking Analytics changes the sidebar to analytics-specific navigation only.

Example:

```text
Analytics

Home
Company
People
Work
Requests
Support
Finance
Reports
Dashboards
```

Only existing Wamiro features should appear.

Do not add new features simply because they would look useful.

---

# 18. SIDEBAR PRINCIPLE

Do not make the sidebar global.

Do not show:

```text
People
Tasks
Tickets
Documents
Leave
Assets
Projects
Analytics
```

inside the Analytics sidebar.

The Analytics workspace sidebar must contain only Analytics features.

---

# 19. SIDEBAR VISUAL STYLE

Use the Frappe-style compact sidebar:

```text
~14rem width
~28px item height
compact vertical spacing
small icon
sentence-case labels
quiet selected state
small count suffix where required
```

Avoid:

```text
large navigation cards
bright active pills
large icons
excessive separators
```

---

# 20. RAIL VISUAL STYLE

Keep the rail:

```text
narrow
quiet
icon-led
persistent
```

The current workspace is visually obvious but not oversized.

---

# 21. PAGE HEADER

Every D7 page uses:

```text
Page title
Optional context
Primary action
Secondary actions
Filters/views where relevant
```

Use the same Frappe-inspired compact header geometry:

```text
~48px header
```

---

# 22. ONE PRIMARY ACTION

There should normally be one primary action.

Examples for existing functionality:

```text
Reports → New report
Dashboards → New dashboard
```

Everything else:

```text
subtle
ghost
outline
icon
```

Do not create five equal-weight buttons.

---

# 23. ANALYTICS HOME

Use the existing analytics information.

Do not add new widgets.

Structure existing content as:

```text
Page header
↓
Existing key metrics
↓
Existing attention/insight information
↓
Existing charts/reports
↓
Existing tables
```

Prefer hierarchy over cards.

---

# 24. DASHBOARD DESIGN

The Frappe-inspired dashboard pattern should be:

```text
Context
↓
KPI strip
↓
Main information
↓
Supporting information
↓
Detailed data
```

Avoid:

```text
card
card
card
card
card
```

across the full page.

---

# 25. KPI STRIP

Use compact aligned metrics.

Example:

```text
Employees      Projects        Pending approvals       Open tickets
1,284           38              12                       27
+4.2%           +3             -5                       +6
```

Use:

```text
divide-x
alignment
typography
```

instead of four giant cards where appropriate.

---

# 26. KPI DESIGN

Each KPI should show:

```text
Label
Value
Existing comparison/trend where already available
```

Do not invent additional trend calculations just to make the UI look richer.

---

# 27. EXISTING DATA ONLY

This is critical.

Do not create fake analytics data.

Do not add placeholder metrics.

Do not invent:

```text
Revenue
Employee health score
AI score
Company score
Performance score
```

unless these already exist in the current Wamiro product.

Redesign existing data only.

---

# 28. CHART DESIGN

Use existing charts only.

Do not add charts simply to fill empty space.

Each existing chart should have:

```text
title
context
visual
existing source/data
```

The chart should be subordinate to the information.

---

# 29. CHART COLORS

Stay within the approved palette.

Do not create rainbow series.

Use:

```text
approved accent
neutral values
approved semantic contrast
```

Where multiple series already exist, differentiate them through:

```text
line style
marker
label
position
```

before adding new colors.

---

# 30. DATA TABLES

Use the same Frappe-style dense table model.

Typical row heights:

```text
40px dense
44–60px standard
```

Use:

```text
fixed columns
aligned trailing values
subtle separators
compact text
```

---

# 31. TABLE STRUCTURE

Table:

```text
checkbox
primary item
secondary metadata
metric
status
date
action
```

Do not turn each table row into a card.

---

# 32. FILTERS

Use compact:

```text
Filter
Sort
View
```

controls.

Advanced filtering should open a popover/drawer.

Do not fill the header with large filter pills.

---

# 33. SAVED VIEWS

Use existing saved-view functionality.

Structure:

```text
My views
Shared
Favorites
```

Keep view management compact.

Do not introduce a new navigation system.

---

# 34. REPORT LIST

Use the Frappe-style compact list/table.

Columns:

```text
Report
Owner
Updated
Schedule
Audience
```

Actions:

```text
Open
Edit
More
```

Only existing actions.

---

# 35. REPORT DETAIL

Use D1 Detail + Meta.

Structure:

```text
Header
Report
Existing filters
Existing data
Metadata
```

Right metadata:

```text
Owner
Source
Updated
Audience
```

Do not add unsupported metadata.

---

# 36. REPORT BUILDER

If the current Wamiro MVP already contains a report builder, redesign it.

Do not expand its feature scope in D7.

Use:

```text
Data
Fields
Filters
Grouping
Sort
Visualization
```

in a structured configuration layout.

Do not make it a giant free-form canvas.

---

# 37. DASHBOARD BUILDER

If already present, use the existing functionality and redesign it.

Use a controlled grid.

Do not add new widget types in D7.

Existing widgets only.

---

# 38. EXECUTIVE DASHBOARD

Use the existing executive information only.

Structure:

```text
Page header
↓
Existing company metrics
↓
Existing important changes
↓
Existing attention/risk information
↓
Existing strategic information
↓
Existing operational information
```

Do not add new business metrics.

---

# 39. EXECUTIVE DENSITY

Executives should see:

```text
high-signal information
```

first.

Do not place every underlying record on the first screen.

Use existing drill-downs when they already exist.

---

# 40. MANAGER ANALYTICS

Use the existing manager analytics.

Structure:

```text
Team overview
↓
Existing workload
↓
Existing tasks/projects
↓
Existing attendance/leave
↓
Existing goals
↓
Existing approvals/risks
```

No new metrics.

---

# 41. PEOPLE ANALYTICS

Use the existing People analytics.

Keep:

```text
table
+
compact metrics
+
existing charts
```

Avoid oversized people cards.

---

# 42. WORK ANALYTICS

Use the existing D3 Work data.

Primary patterns:

```text
List
Table
Dashboard
Detail
```

Do not create a separate Work analytics design.

---

# 43. REQUEST ANALYTICS

Use existing D4 request data.

Patterns:

```text
Table
Dashboard
Detail
```

Statuses must use the approved Wamiro palette and semantic labels.

---

# 44. SUPPORT ANALYTICS

Use existing D6 support data.

Patterns:

```text
Ticket list
SLA summary
Table
Existing charts
```

Do not create a new support analytics visual language.

---

# 45. FINANCE ANALYTICS

If already present:

```text
Transactions
Expenses
Purchases
Budgets
```

Use a dense finance table and restrained summaries.

Do not add accounting features in D7.

---

# 46. DRILL-DOWN

Preserve existing drill-down behavior.

Ideal navigation:

```text
Company
↓
Department
↓
Team
↓
Record
```

When drilling down:

```text
preserve existing filters
preserve tenant
preserve permissions
```

Do not invent new drill-down capabilities if they don't already exist.

---

# 47. DATA FRESHNESS

If existing data has freshness information, show it clearly:

```text
Updated 4 min ago
```

or:

```text
Data through 24 Aug 2026
```

Do not claim real-time data if the source isn't real-time.

---

# 48. DATA SOURCE

If the current analytics system already knows its source, present it using a compact metadata pattern.

Example:

```text
Source: HR
Updated: 8 min ago
```

Do not add unsupported data-source metadata.

---

# 49. EMPTY STATES

Use the shared Wamiro/Frappe-style empty state.

Structure:

```text
small icon
title
short explanation
one primary action where relevant
```

Example:

```text
No reports yet

Create a report to get started.

[New report]
```

No large illustrations.

---

# 50. NO DATA VS NO ACCESS

Differentiate:

```text
No data
```

from:

```text
You don't have access to this data.
```

Never expose restricted information through an empty-state explanation.

---

# 51. LOADING STATE

Never blank the entire page.

Keep:

```text
Rail
Sidebar
Header
```

visible.

Use:

```text
skeleton rows
skeleton KPI
skeleton chart area
```

where appropriate.

---

# 52. ERROR STATE

Use the shared error component.

Example:

```text
This report couldn't be loaded.

[Retry]
```

No raw stack trace.

---

# 53. TOASTS

Use one shared toast system.

Examples:

```text
Report saved
Dashboard updated
Export started
```

One related action should produce one toast.

---

# 54. CONFIRMATION

Use the existing shared confirmation system for:

```text
Delete report
Delete dashboard
Remove schedule
Revoke sharing
```

Do not create custom confirmation UI.

---

# 55. FORMS

Use the existing Wamiro form system.

Every field should follow:

```text
label
description
control
error
required
```

Never use placeholder text as the only label.

---

# 56. ICON RULE

Icons support labels.

Do not replace important actions with unexplained icons.

Icon-only controls are appropriate for universal actions such as:

```text
Close
More
Search
Back
```

---

# 57. ALIGNMENT

Frappe-style alignment is mandatory.

Repeated metadata must use stable columns.

Do not create ragged layouts such as:

```text
label...................time
label........time
label.......................time
```

Use fixed-width trailing columns.

---

# 58. BORDERS

Borders must have a purpose.

Use them for:

```text
table separation
section separation
input boundary
dialog boundary
distinct surface
```

Do not box every section.

---

# 59. HIERARCHY THROUGH INK, NOT BOXES

Use:

```text
text weight
text size
text color
spacing
dividers
```

before adding another card or container.

If a section can work without a surrounding box, remove the box.

---

# 60. CARD RULE

Cards are allowed only when they group a meaningful independent unit.

Do not convert:

```text
every KPI
every chart
every row
every section
```

into individual cards.

Prefer:

```text
divided sections
tables
lists
aligned strips
```

---

# 61. MOBILE

Use the same information model.

Desktop:

```text
Rail
Sidebar
Header
Content
```

Mobile:

```text
Workspace selector
Navigation sheet
Page header
Content
```

Do not shrink the desktop dashboard into a tiny version.

---

# 62. MOBILE ANALYTICS

Show:

```text
Key metric
↓
Attention
↓
Existing chart
↓
Existing data
```

Avoid multi-column desktop widgets.

---

# 63. ACCESSIBILITY

Follow:

```text
Keyboard navigation
Focus-visible
Semantic headings
Accessible tables
Accessible charts
Reduced motion
Screen reader labels
```

Charts must have a text/table alternative when needed.

---

# 64. FOCUS STYLES

Use the shared semantic focus system.

Do not create separate custom focus colors on every analytics component.

---

# 65. CSS CUSTOMIZATION

If a shared component must be styled beyond its normal API:

Use semantic/data attributes:

```text
data-slot
data-state
```

Do not rely on fragile internal classes.

Do not create arbitrary class-injection conventions.

---

# 66. MODERN COMPONENTS ONLY

Use the current Wamiro equivalents of:

```text
AppShell
Sidebar
List
Table
ScrollArea
Dialog
Popover
Tooltip
Tabs
Editor where applicable
```

Do not introduce legacy duplicate components.

---

# 67. RESPONSIVE TABLES

On mobile:

```text
reduce columns
preserve primary identity
move secondary metadata below
allow detail navigation
```

Do not squeeze 10 columns onto a phone.

---

# 68. SECURITY

Redesign must not change authorization behavior.

Verify:

```text
employee analytics scope
manager scope
HR sensitive-data scope
executive scope
admin scope
tenant isolation
shared dashboard access
export access
```

---

# 69. PERFORMANCE

Do not reduce existing performance.

Preserve:

```text
server-side aggregation
pagination
lazy charts
virtualized tables
cached summaries
```

Avoid turning server-rendered analytics into a giant client-side bundle.

---

# 70. PALETTE AUDIT

Before D7 is complete, scan the implementation for:

```text
#hex
rgb(
rgba(
hsl(
hsla(
named colors
```

Every Wamiro application color must use:

```text
#7A7A7A
#F8F8F8
#242424
#D9D9D9
#999999
#BD660E
#171717
#383838
#AFAFAF
#C23838
```

Exceptions:

```text
external media
user-uploaded content
provider logos
document content
```

must not alter the Wamiro application theme.

---

# 71. VISUAL QA — Frappe MATCH

Compare every D7 screen against the supplied Frappe reference style.

Check:

```text
Font
Font size
Font weight
Sidebar width
Header height
Row height
Spacing
Alignment
Border weight
Surface tone
Button size
Button hierarchy
Badge size
Icon size
Shadow
Radius
Density
Dark mode
Light mode
```

The question is not:

> "Does it look modern?"

The question is:

> **"Does it feel like the same design language as the Frappe workspace?"**

---

# 72. D7 VALIDATION SCREENS

Use only existing Wamiro D7 screens.

Validate:

```text
1. Analytics Home
2. Executive Dashboard
3. Manager Dashboard
4. Existing People Analytics
5. Existing Work Analytics
6. Existing Request Analytics
7. Existing Support Analytics
8. Existing Report List
9. Existing Report Builder
10. Existing Report Detail
11. Existing Dashboard Builder
12. Existing Metric/Detail view
13. Existing drill-down
14. Mobile analytics
```

Do not add new screens simply to make the phase appear larger.

---

# 73. D7 IMPLEMENTATION ORDER

```text
1. Audit current Wamiro D7 UI
2. Identify all existing analytics screens
3. Remove one-off visual patterns
4. Apply exact Frappe-style font system
5. Apply exact approved palette
6. Apply semantic color tokens
7. Apply Frappe typography hierarchy
8. Apply Frappe spacing
9. Apply Frappe radius
10. Apply Frappe shadow rules
11. Apply Frappe shell
12. Apply contextual Analytics sidebar
13. Redesign existing KPI areas
14. Redesign existing tables
15. Redesign existing charts
16. Redesign existing report screens
17. Redesign existing dashboards
18. Redesign existing executive screen
19. Redesign existing manager screen
20. Redesign mobile screens
21. Verify light mode
22. Verify dark mode
23. Run accessibility review
24. Run permission/security review
25. Run performance review
26. Run palette audit
27. Run screenshot/visual comparison
28. Fix inconsistencies
29. Freeze D7
30. Prepare D8 only from actual remaining product requirements
```

---

# 74. D7 DELIVERABLES

```text
01. Redesigned Analytics Workspace
02. Redesigned Analytics Sidebar
03. Redesigned Analytics Home
04. Redesigned existing KPI system
05. Redesigned existing Executive Dashboard
06. Redesigned existing Manager Dashboard
07. Redesigned existing People Analytics
08. Redesigned existing Work Analytics
09. Redesigned existing Request Analytics
10. Redesigned existing Support Analytics
11. Redesigned existing Finance Analytics where already present
12. Redesigned existing Goal Analytics where already present
13. Redesigned existing Workflow Analytics where already present
14. Redesigned existing Report List
15. Redesigned existing Report Builder
16. Redesigned existing Report Detail
17. Redesigned existing Dashboard Builder
18. Redesigned existing Dashboard Sharing
19. Redesigned existing Saved Views
20. Redesigned existing Drill-down
21. Redesigned existing Export
22. Redesigned existing Scheduled Reports
23. Redesigned mobile analytics
24. Exact palette implementation
25. Exact typography implementation
26. Semantic token implementation
27. Dark mode verification
28. Light mode verification
29. Accessibility verification
30. Security verification
31. Performance verification
32. Visual comparison and final polish
```

---

# 75. D7 DEFINITION OF DONE

D7 is complete only when:

```text
No new product features were added.

Existing D7 functionality has been redesigned.

The same InterVar font is used throughout.

The approved Wamiro palette is used throughout.

Light and dark mode use the same approved design language.

Semantic tokens are used instead of raw palette utilities.

The Analytics workspace uses the Rail → Sidebar → Page architecture.

The sidebar contains only Analytics features.

The UI is dense but breathable.

The interface is structured like an operational enterprise application.

There is minimal card usage.

There are no gradients.

There are no AI-style purple/blue effects.

There are no unnecessary decorative elements.

Headers use sentence case.

Typography follows the supplied Frappe hierarchy.

Tables use stable column alignment.

Rows remain compact.

Buttons follow clear primary/secondary hierarchy.

Charts are information-first.

Dashboard hierarchy is clear.

Mobile is intentionally adapted.

Accessibility is verified.

Permissions are preserved.

Tenant isolation is preserved.

Performance is preserved.

The finished D7 screen should look like it belongs to the same UI family as the supplied Frappe Tickets reference.
```

---

# 76. AGENT EXECUTION RULE

The current Wamiro MVP works.

Do not rebuild business logic simply to change visuals.

Do not add new analytics features.

Do not invent missing data.

Do not create fake dashboard widgets.

Do not create new module navigation.

Only:

```text
Inspect
↓
Understand existing D7
↓
Choose correct existing archetype
↓
Reuse D1–D6 components
↓
Redesign
↓
Run
↓
Compare visually
↓
Correct
↓
Test
↓
Document
```

If an existing Wamiro screen has too much whitespace, too many cards, inconsistent controls or an incorrect navigation structure, redesign the existing screen rather than adding more content.

---

# 77. FINAL DESIGN PRINCIPLE

> **Do not make Wamiro "similar to Frappe." Make the existing Wamiro UI follow the same design discipline, visual hierarchy, geometry, typography, density and interaction grammar.**

The target is:

```text
Same visual language
+
Same font family
+
Same visual density
+
Same navigation philosophy
+
Same table/list discipline
+
Same restraint
+
Wamiro's existing functionality
```

---

# 78. FINAL D7 TARGET

The user should open Wamiro Analytics and feel:

> **"This is the same serious, dense, structured application experience as the Frappe workspace I just saw."**

Not:

> "This is a colorful dashboard inspired by Frappe."

The result must be:

```text
Structured
Quiet
Dense
Precise
Authentic
Enterprise-grade
```

with **no new product features added during this redesign phase**.

---

# WAMIRO

> **One workplace. One operating system for your organization.**
