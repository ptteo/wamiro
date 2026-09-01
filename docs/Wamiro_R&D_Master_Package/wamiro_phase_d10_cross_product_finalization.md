# WAMIRO — PHASE D10
## Cross-Product Finalization, Visual Consistency, Mobile, Accessibility, Performance & Enterprise Polish
### Finalization Phase — No New Product Features

**Program:** Wamiro MNC-Grade UI/UX Transformation  
**Phase:** D10 — Cross-Product Finalization  
**Prerequisite:** D1–D9 completed  
**Primary goal:** Make the entire Wamiro product feel like one mature, cohesive enterprise application by eliminating inconsistencies, completing responsive/mobile behavior, accessibility, performance and final visual/interaction QA.

---

# 1. D10 MISSION

D1–D9 established the Wamiro workspaces.

D10 turns them into one product:

```text
People
+
Work
+
Requests
+
Knowledge
+
Documents
+
Support
+
Analytics
+
AI
+
Administration
        ↓
ONE WAMIRO PRODUCT
```

D10 is a:

```text
unification
+
polish
+
consistency
+
performance
+
accessibility
+
responsive
+
enterprise-quality
```

phase.

---

# 2. ABSOLUTE RULE — NO NEW FEATURES

Do not add:

```text
new modules
new major workspaces
new business workflows
new AI capabilities
new dashboard systems
new navigation domains
new speculative widgets
```

If a missing capability is discovered:

```text
document it for D11
```

Do not silently add it to D10.

---

# 3. FINAL APPLICATION ARCHITECTURE

The complete product must follow:

```text
                 WAMIRO
                    │
                  RAIL
          major workspace switch
                    │
              CONTEXTUAL
                SIDEBAR
                    │
                  PAGE
                    │
          ┌─────────┼─────────┐
         LIST     DETAIL     ACTION
```

The permanent rule is:

```text
Rail
→ major product/mental model

Sidebar
→ features inside active workspace

Page
→ current task/context
```

---

# 4. RAIL AUDIT

Audit every Rail item.

Ask:

```text
Is this a genuine major workspace?
```

If not:

```text
move it into the correct workspace Sidebar
```

Do not promote features into the Rail merely because they are frequently used.

---

# 5. SIDEBAR AUDIT

For every major workspace:

```text
People
Work
Requests
Knowledge
Documents
Support
Analytics
AI
Administration
```

verify that the Sidebar contains only features belonging to that workspace.

No unrelated features.

---

# 6. WORKSPACE SWITCHING QA

When clicking a Rail workspace:

```text
Active Rail changes
↓
Sidebar changes
↓
Workspace context changes
↓
Correct default page loads
↓
Breadcrumbs update
↓
Commands update
↓
Search scope updates
```

No stale navigation from the previous workspace.

---

# 7. WORKSPACE STATE

Where already supported, preserve:

```text
last view
last filter
last tab
last saved view
```

Reset invalid state on:

```text
tenant change
permission change
workspace configuration change
resource removal
explicit reset
```

---

# 8. GLOBAL SEARCH CONSISTENCY

Use one global search architecture across:

```text
People
Work
Requests
Knowledge
Documents
Support
Analytics
```

Every result should follow one structure:

```text
Type
Title
Context
Metadata
Action
```

No module-specific search design.

---

# 9. COMMAND PALETTE CONSISTENCY

Maintain one command palette.

It may expose contextual actions based on the active workspace.

Do not duplicate command systems.

---

# 10. NOTIFICATION CONSISTENCY

Maintain one notification center.

Events from:

```text
People
Work
Requests
Knowledge
Documents
Support
Analytics
AI
Administration
```

must use the same notification structure.

---

# 11. ACTIVITY + COMMENTS

Use one visual grammar for activity and comments across:

```text
Tasks
Projects
Requests
Documents
Knowledge
Discussions
Announcements
Tickets
```

Do not allow module-specific timeline/comment designs to drift.

---

# 12. ENTITY LINKING

People, projects, tasks, requests, tickets, documents, articles and goals should use one consistent identity/link pattern.

Cross-workspace navigation should feel continuous.

Example:

```text
People
→ Rahul Sharma
→ Project Phoenix
→ Request
```

---

# 13. FONT AUDIT

The application must use:

```text
InterVar
```

consistently.

Remove accidental competing application fonts.

---

# 14. TYPOGRAPHY AUDIT

Review:

```text
page titles
section headings
row titles
table headers
metadata
buttons
badges
paragraphs
helper text
forms
dialogs
```

Use the established Frappe-inspired hierarchy.

---

# 15. TYPOGRAPHY SCALE

Keep:

```text
11px → micro
12px → captions/metadata
13px → secondary UI
14px → default UI
15px → dense section labels
16px → section content
17px → panel titles
18px → page titles
20px → prominent titles
24px+ → avoid in operational UI
```

---

# 16. SENTENCE CASE

No normal product UI should use:

```text
ALL CAPS
fake uppercase hierarchy
tracking-wider headings
```

Use:

```text
Employee directory
Recent activity
Request details
```

---

# 17. FINAL APPROVED PALETTE

The entire Wamiro application uses:

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

This remains mandatory across:

```text
People
Work
Requests
Knowledge
Documents
Support
Analytics
AI
Administration
```

---

# 18. SEMANTIC COLOR TOKENS

Use:

```text
text-ink-*
bg-surface-*
border-outline-*
```

or the Wamiro semantic equivalents mapped to the approved palette.

Do not use raw application colors such as:

```text
text-gray-900
bg-white
border-gray-200
```

when semantic tokens exist.

---

# 19. DARK MODE

Every major workspace must be tested in dark mode.

Check:

```text
Rail
Sidebar
Header
Tables
Lists
Forms
Buttons
Dialogs
Dropdowns
Charts
Badges
Empty states
Errors
Loading
Focus
```

Dark mode must remain the same Wamiro visual language.

---

# 20. LIGHT MODE

Repeat the same inspection in light mode.

Light and dark are two themes of one product, not two different designs.

---

# 21. NO GRADIENTS

Audit the application for:

```text
linear-gradient
radial-gradient
conic-gradient
gradient text
decorative gradient backgrounds
```

Remove from Wamiro application UI.

---

# 22. NO GLASSMORPHISM / NEON

Remove unnecessary:

```text
glows
neon borders
decorative transparency
heavy backdrop blur
futuristic effects
```

Wamiro must remain a serious enterprise application.

---

# 23. CARD AUDIT

For every card ask:

```text
What independent information does this card represent?
```

If the answer is weak:

```text
replace card with
section
list
table
divider
surface
```

Avoid card soup.

---

# 24. BORDER AUDIT

Borders should establish:

```text
table separation
interactive controls
surface boundaries
dialogs
inputs
split panes
```

Remove decorative borders.

---

# 25. SHADOW AUDIT

Use shadows only for meaningful elevation:

```text
shadow-sm
shadow
shadow-md
shadow-lg
shadow-xl
```

Normal hierarchy should come from:

```text
spacing
surface
border
typography
```

not heavy shadows.

---

# 26. RADIUS AUDIT

Standard scale:

```text
4px
8px
10px
12px
16px
20px
full
```

Operational UI should primarily use:

```text
8px
10px
12px
```

Do not introduce arbitrary radii.

---

# 27. DENSITY AUDIT

The product should feel:

```text
Dense but breathable
```

Review:

```text
row height
sidebar density
header height
padding
gaps
metadata
table density
```

Remove unnecessary whitespace without harming readability.

---

# 28. HEADER GEOMETRY

Standard compact header:

```text
~48px
```

where defined by D1.

No workspace should invent its own header height.

---

# 29. SIDEBAR GEOMETRY

Desktop target:

```text
~14rem
```

Keep navigation compact.

Do not inflate items into large consumer-style navigation blocks.

---

# 30. RAIL GEOMETRY

The Rail remains:

```text
narrow
stable
icon-led
quiet
```

Do not turn the Rail into a second Sidebar.

---

# 31. LIST AUDIT

All major list screens must reuse the shared list system.

Check:

```text
row geometry
hover
selection
metadata
actions
empty
loading
```

---

# 32. TABLE AUDIT

All tables must share:

```text
header
sorting
column alignment
row heights
selection
pagination
loading
empty
```

Trailing values must align using stable columns.

---

# 33. ROW HEIGHT

Use:

```text
40px → dense
44–60px → standard
```

Choose one clear mechanism per list/table.

---

# 34. TWO-PANE AUDIT

For:

```text
Mail
Tickets
Documents
Discussions
```

use one split-pane model.

Desktop:

```text
List
+
Detail
```

Mobile:

```text
List route
↓
Detail route
```

---

# 35. DETAIL PAGE AUDIT

Use the common:

```text
Header
Main
Metadata
Activity
Related
```

where relevant.

No workspace-specific detail systems unless strictly justified.

---

# 36. SETTINGS AUDIT

All settings use:

```text
Navigation
Header
Section
Description
Rows
Divider
Control
```

Avoid nested cards.

---

# 37. FORM AUDIT

Every form should use:

```text
label
description
control
error
required
```

No placeholder-only labels.

---

# 38. BUTTON HIERARCHY

Standardize:

```text
Primary
Secondary
Subtle
Ghost
Icon-only
```

Normally one primary action per screen.

---

# 39. ICON AUDIT

Use one icon family.

Standardize:

```text
default size
inline size
mobile size
stroke
alignment
```

Icons support labels.

---

# 40. STATUS AUDIT

Centralize status rendering:

```text
label
icon
semantic token
```

Never create one-off status colors.

---

# 41. EMPTY STATES

Use a common pattern:

```text
small icon
title
short explanation
primary action when relevant
```

Avoid generic:

```text
No data
```

when a useful explanation is available.

---

# 42. LOADING STATES

Keep the application shell visible.

Use:

```text
skeleton
LoadingText
spinner
button loading
```

according to context.

Never blank the whole page during ordinary loading.

---

# 43. ERROR STATES

Use a shared grammar:

```text
What happened
What can the user do
Recovery action
```

Example:

```text
We couldn't load your requests.

[Retry]
```

---

# 44. MOBILE ARCHITECTURE

Desktop:

```text
Rail
+
Contextual Sidebar
+
Header
+
Content
```

Mobile:

```text
Workspace selector
+
Navigation sheet/bottom navigation
+
Mobile header
+
Content
```

Keep the same information model.

---

# 45. MOBILE WORKSPACE SELECTOR

Mobile must clearly show:

```text
Current workspace
```

Example:

```text
People ▼
```

The selector opens accessible major workspaces.

---

# 46. MOBILE SIDEBAR

The active workspace's Sidebar becomes a:

```text
sheet
drawer
menu
```

using existing Wamiro components.

---

# 47. MOBILE TABLES

Do not squeeze desktop tables onto phones.

Use:

```text
primary identity
secondary metadata
detail navigation
```

Horizontal scrolling is allowed only when genuinely necessary.

---

# 48. MOBILE ACTIONS

Desktop action clusters may collapse into:

```text
More
```

while preserving the primary action.

---

# 49. MOBILE FORMS

Use:

```text
one column
clear labels
comfortable controls
accessible submit action
```

---

# 50. ACCESSIBILITY TARGET

Target:

```text
WCAG 2.2 AA
```

---

# 51. KEYBOARD QA

Test:

```text
Rail
Sidebar
Menus
Tabs
Lists
Tables
Dialogs
Drawers
Command palette
Search
Calendar
Editor
```

No keyboard traps.

---

# 52. FOCUS QA

Use one global focus-visible strategy.

Focus must be:

```text
visible
consistent
high contrast
```

No component-specific arbitrary focus colors.

---

# 53. SCREEN READER QA

Verify semantic labels for:

```text
navigation
buttons
forms
tables
dialogs
status
links
icons
charts
```

Decorative icons should be hidden from assistive technology.

---

# 54. CHART ACCESSIBILITY

Important visualizations need:

```text
summary
data/table alternative where appropriate
```

Never communicate critical information through color alone.

---

# 55. REDUCED MOTION

Respect:

```text
prefers-reduced-motion
```

Remove unnecessary:

```text
animations
transitions
loading theatrics
```

---

# 56. PERFORMANCE AUDIT

Measure:

```text
initial load
navigation
workspace switching
search
tables
documents
dashboards
AI
support
administration
```

---

# 57. PERFORMANCE RULE

Use:

```text
route-level code splitting
lazy loading
dynamic imports
server rendering where appropriate
```

Do not ship all workspace code in the initial bundle.

---

# 58. LARGE DATASETS

Use:

```text
server-side pagination
server-side filtering
virtualization
indexed queries
lazy loading
```

Do not render thousands of records by default.

---

# 59. DASHBOARD PERFORMANCE

Use:

```text
parallel loading
cached summaries
progressive rendering
lazy widgets
```

Low-priority widgets must not block the primary dashboard.

---

# 60. SEARCH PERFORMANCE

Use:

```text
debouncing
server-side search
indexes
permission filtering
```

Never download the entire organization database for normal client-side search.

---

# 61. DOCUMENT PERFORMANCE

Use:

```text
lazy preview
lazy images
range requests where appropriate
server-side authorization
```

---

# 62. WORKSPACE SWITCH PERFORMANCE

Rail switching should feel immediate.

Preserve:

```text
shell
theme
tenant
```

and load workspace content incrementally.

Do not recreate the whole application on every workspace click.

---

# 63. SECURITY REGRESSION

After D9, retest:

```text
Employee
Manager
HR
IT
Executive
Admin
```

against every workspace.

Verify:

```text
route
API
search
export
download
attachment
AI retrieval
AI action
audit
```

---

# 64. TENANT ISOLATION REGRESSION

Test Tenant A and Tenant B for:

```text
navigation
search
People
Work
Requests
Documents
Support
Analytics
AI
Administration
Audit
```

There must be no cross-tenant leakage.

---

# 65. PERMISSION REGRESSION

Do not rely only on hidden UI.

Verify backend authorization for:

```text
route
API
search
download
export
attachment
AI
audit
```

---

# 66. AUDIT REGRESSION

Verify important operations remain auditable:

```text
create
edit
delete
approve
reject
share
export
role change
permission change
security change
integration change
```

---

# 67. CROSS-BROWSER QA

Validate supported browsers, at minimum where required:

```text
Chrome
Edge
Firefox
Safari
```

---

# 68. SCREEN SIZE QA

Test:

```text
1920
1440
1366
tablet
430
390
```

Inspect:

```text
overflow
clipping
tables
menus
dialogs
navigation
```

---

# 69. VISUAL REGRESSION

Create screenshot baselines for:

```text
Home
People
Work
Requests
Knowledge
Documents
Support
Analytics
AI
Administration
```

Run:

```text
desktop light
desktop dark
mobile light
mobile dark
```

---

# 70. PIXEL CONSISTENCY REVIEW

Compare across workspaces:

```text
sidebar width
header height
row height
button size
icon size
font size
padding
border
radius
shadow
```

Fix inconsistencies even if they seem small.

---

# 71. DESIGN TOKEN GOVERNANCE

No workspace may create its own:

```text
font
spacing scale
radius scale
shadow scale
button system
status palette
```

Everything comes from the shared Wamiro design system.

---

# 72. COMPONENT DUPLICATION AUDIT

Search for duplicated implementations of:

```text
Button
Table
List
Modal
Dialog
Dropdown
Sidebar
PageHeader
Tabs
Badge
Toast
EmptyState
Loading
```

Consolidate where practical.

---

# 73. CSS DUPLICATION AUDIT

Search for repeated:

```text
padding
fonts
radii
colors
borders
shadows
```

Replace with tokens/utilities.

---

# 74. CONTENT DESIGN AUDIT

Review:

```text
labels
buttons
empty states
errors
helper text
confirmations
notifications
```

Use concise enterprise language.

Avoid excessive:

```text
Amazing!
Let's get started!
Oops!
```

---

# 75. TERMINOLOGY GOVERNANCE

One concept must have one primary product name.

Examples:

```text
Employee
Request
Task
Project
Ticket
Document
Knowledge article
```

Do not switch terminology between workspaces for the same object.

---

# 76. STATUS VOCABULARY

Normalize common states:

```text
Draft
Pending
In Progress
Blocked
Approved
Rejected
Completed
Canceled
Archived
```

Provider-specific states can map into Wamiro states where appropriate.

---

# 77. DATE/TIME CONSISTENCY

Use consistent:

```text
timezone
date format
relative timestamps
duration
```

Examples:

```text
Today
Yesterday
24 Aug 2026
2h ago
```

Do not mix formats randomly.

---

# 78. NUMBER/CURRENCY CONSISTENCY

Use consistent:

```text
currency
decimal precision
percentage
duration
number grouping
```

---

# 79. PERMISSION UX AUDIT

Verify:

```text
hidden features
restricted sections
disabled actions
permission explanations
```

Never rely on a disabled button as the only security control.

---

# 80. EXECUTIVE VS ADMIN

Keep these mental models separate.

Executive:

```text
overview
decision
risk
trend
```

Administration:

```text
configuration
control
security
governance
```

---

# 81. AI REGRESSION

AI must remain:

```text
contextual
optional
permission-aware
non-dominant
```

No AI visual styling should leak into ordinary Wamiro workspaces.

---

# 82. EXTERNAL PROVIDER REGRESSION

Provider-specific products must remain implementation details:

```text
Zammad
GLPI
Frappe HR
storage
email
SSO
```

Do not leak their UI styling into Wamiro.

---

# 83. DEGRADED UX

Where already supported:

```text
Provider unavailable
Network unavailable
Partial data
```

Keep the shell usable.

Use:

```text
clear notice
retry
cached information where valid
```

---

# 84. FINAL PAGE REVIEW

For every important screen ask:

```text
What is this page for?
What is the primary action?
What is the primary information?
What can be removed?
What can be denser?
What can be aligned?
Does the user know where they are?
Does the user know what to do next?
```

---

# 85. FINAL PRODUCT REVIEW

Ask:

```text
Does every workspace feel like Wamiro?
Is navigation predictable?
Are components reused?
Are visual patterns consistent?
Are permissions respected?
Is mobile coherent?
Is dark mode coherent?
Is light mode coherent?
Is the product calm rather than decorative?
```

---

# 86. Frappe-STYLE FINAL REVIEW

Compare Wamiro with the supplied Frappe references:

```text
font
density
sidebar
header
tables
lists
buttons
badges
spacing
surfaces
borders
radius
shadows
mobile translation
dark mode
```

The goal is not superficial imitation.

The goal is:

> **the same disciplined enterprise application grammar.**

---

# 87. FINAL REGRESSION SCREENS

Validate:

```text
1. Home
2. People Directory
3. Employee Profile
4. My Work
5. Task List
6. Project
7. Requests
8. Approval Center
9. Knowledge
10. Documents
11. Support Tickets
12. Asset List
13. Analytics
14. Executive Dashboard
15. AI Assistant
16. Administration
17. User Management
18. Security Center
```

For each:

```text
Desktop light
Desktop dark
Mobile light
Mobile dark
```

---

# 88. D10 IMPLEMENTATION ORDER

```text
1. Full application audit
2. Rail architecture audit
3. Sidebar architecture audit
4. Typography audit
5. Color/token audit
6. Spacing audit
7. Radius audit
8. Shadow audit
9. Component duplication audit
10. Navigation consistency
11. Search consistency
12. Command palette consistency
13. Notification consistency
14. Activity/comment consistency
15. Table/list consistency
16. Detail-page consistency
17. Settings consistency
18. Form consistency
19. Status consistency
20. Mobile architecture
21. Responsive QA
22. Accessibility
23. Security regression
24. Tenant isolation regression
25. Performance regression
26. Cross-browser QA
27. Screenshot visual regression
28. Light/dark QA
29. Exact palette audit
30. Content/terminology audit
31. Final polish
32. D11 backlog
```

---

# 89. D10 DELIVERABLES

```text
01. Unified Rail Architecture
02. Unified Contextual Sidebar
03. Global Typography Audit
04. Global Color Token Audit
05. Global Spacing Audit
06. Global Radius Audit
07. Global Shadow Audit
08. Component Consolidation
09. Navigation Consistency
10. Search Consistency
11. Command Palette Consistency
12. Notification Consistency
13. Activity/Comment Consistency
14. List/Table Consistency
15. Detail Page Consistency
16. Settings Consistency
17. Form Consistency
18. Status Consistency
19. Mobile Architecture Finalization
20. Responsive QA
21. Accessibility QA
22. Security Regression QA
23. Tenant Isolation QA
24. Performance QA
25. Cross-browser QA
26. Visual Regression QA
27. Light Mode Final QA
28. Dark Mode Final QA
29. Exact Palette Audit
30. Content/Terminology Audit
31. Final Enterprise Polish
32. D11 Backlog
```

---

# 90. D10 DEFINITION OF DONE

```text
Wamiro feels like one application.

All major workspaces use the same Rail architecture.

Every workspace has the correct contextual Sidebar.

No feature has accidentally become a duplicate workspace.

Typography is consistent.

InterVar is used consistently.

The approved palette is used consistently.

Semantic tokens are used.

Light mode is coherent.

Dark mode is coherent.

No gradients exist.

No unnecessary visual effects exist.

Cards are used only when justified.

Tables and lists share one geometry.

Buttons share one hierarchy.

Forms share one structure.

Settings share one structure.

Activity/comments share one structure.

Search feels like one system.

Command palette feels like one system.

Notifications feel like one system.

Mobile feels native.

Desktop feels dense but breathable.

Accessibility passes.

Security regressions pass.

Tenant isolation passes.

Performance remains acceptable.

Cross-browser rendering is acceptable.

Visual regression is acceptable.

No new product features were introduced.
```

---

# 91. AGENT EXECUTION RULE

The existing Wamiro product is working.

D10 is a quality/redesign pass, not a rewrite.

Do not:

```text
rewrite backend
replace databases
replace providers
replace working business logic
add speculative features
```

Do:

```text
Inspect
↓
Measure
↓
Consolidate
↓
Redesign
↓
Test
↓
Compare
↓
Fix
↓
Repeat
```

Every visual change must be checked against:

```text
desktop
mobile
light
dark
permissions
tenant
accessibility
performance
```

---

# 92. FINAL D10 PRINCIPLE

> **The final product should look as though one disciplined design team built every screen from the beginning.**

There should be no obvious difference between:

```text
HR
IT
Analytics
AI
Admin
Work
Requests
Documents
```

They should all feel like:

```text
WAMIRO
```

---

# 93. FINAL D10 TARGET

The finished product should communicate:

```text
Professional
Structured
Quiet
Fast
Dense
Clear
Predictable
Secure
Accessible
Enterprise-grade
```

The user should not have to think about the design system.

They should simply feel:

> **Everything works the way it should.**

---

# WAMIRO

> **One workplace. One operating system for your organization.**
