# WAMIRO — PHASE D1
## Unified Design Foundation, Application Shell & Workspace Grammar

**Program:** Wamiro MNC-Grade UI/UX Transformation  
**Phase:** D1 — Design Foundation  
**Status:** First design phase after the working MVP  
**Prerequisites:** Working MVP + Wamiro Phase 1 foundation  
**Primary goal:** Establish one reusable, authentic, Frappe-inspired design language for every Wamiro workspace — including features that do not exist in Frappe.

---

# 1. IMPORTANT CHANGE FROM THE PREVIOUS PLAN

Wamiro will **not** be redesigned as a collection of only the Frappe recipes.

Frappe provides several excellent workspace recipes, but Wamiro contains many additional capabilities that Frappe does not provide.

Therefore:

> **Frappe recipes are reference archetypes, not the complete Wamiro product map.**

The design strategy is:

```text
Frappe design principles
        +
Frappe workspace archetypes
        +
Wamiro's own product requirements
        +
Wamiro's own enterprise capabilities
        ↓
One unified Wamiro Design System
```

The same Wamiro design language must be applied to **every** workspace, including:

```text
Home
People
Employee Profiles
Departments
Teams
Attendance
Leave
My Work
Tasks
Projects
Goals
Calendar
Requests
Approvals
Knowledge
Documents
Announcements
Discussions
IT
Tickets
Assets
Analytics
CEO Dashboard
AI
Administration
Security
Permissions
Integrations
Organization Management
```

Frappe is therefore the **design reference**, not the boundary of what Wamiro can look like.

---

# 2. THE CORE DESIGN DECISION

The product must feel like:

> **One application with many workspaces.**

It must NOT feel like:

```text
HR app
+
project app
+
ticketing app
+
finance app
+
document app
+
AI app
```

stitched together.

Instead:

```text
                         WAMIRO
                           │
                    ONE DESIGN SYSTEM
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
     People              Work              Company
        │                  │                  │
     HR / Leave        Projects / Tasks   Requests / Docs
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                  Same interaction grammar
```

The user should know how to use a Wamiro workspace before they have ever opened it.

---

# 3. FRAPPE RESEARCH FINDINGS TO RETAIN

The current Frappe UI documentation emphasizes:

- gray-first visual hierarchy
- semantic color tokens
- typography as the main hierarchy mechanism
- one primary action per screen
- compact business UI
- consistent list geometry
- trailing metadata alignment
- rail + sidebar + pinned header desktop shell
- separate mobile navigation model
- reusable list/table primitives
- reusable settings patterns
- two-pane layouts
- board/list workspace switching
- focused editors
- strong defaults

Frappe UI's current public site describes the library as battle-tested components for real-world applications with strong defaults. Its examples visibly use a common shell, rail, sidebar, compact navigation, reusable list primitives and consistent headers. citeturn918404view0turn918404view1turn918404view3

---

# 4. WHAT WE COPY AS A DESIGN IDEA

Adopt the following **design principles and reusable interaction patterns**:

```text
Gray-first UI
+
semantic tokens
+
compact geometry
+
clear hierarchy
+
one primary action
+
quiet secondary controls
+
consistent lists
+
consistent tables
+
consistent settings
+
consistent detail pages
+
consistent split panes
+
consistent mobile behavior
```

Do NOT make Wamiro visually indistinguishable from Frappe.

Do not copy:
- Frappe logo
- Frappe wordmark
- Frappe product naming
- Frappe-specific content
- Frappe customer content
- exact branded identity

Wamiro must remain its own product.

---

# 5. D1 SCOPE

Phase D1 is **not** the phase for redesigning every business workspace.

D1 establishes the foundation that all later design phases will use.

D1 must deliver:

```text
Design tokens
Typography
Color system
Spacing system
Radius system
Elevation system
Icon rules
Core controls
Navigation
Application shell
Sidebar
Rail
Page header
List primitives
Table primitives
Split pane
Detail layout
Settings layout
Loading states
Empty states
Error states
Permission states
Responsive shell
Mobile navigation
Dark mode
Light mode
Accessibility baseline
Design documentation
Workspace archetype system
```

---

# 6. D1 PROGRAM STRUCTURE

The overall UI redesign should now be executed in phases:

```text
D1
Design Foundation + Shell

D2
People + Employee Experience

D3
Work + Projects + Tasks

D4
Requests + Approvals + Workflows

D5
Knowledge + Documents + Communication

D6
IT + Support + Assets

D7
Analytics + Executive Experience

D8
AI Experience + Contextual Intelligence

D9
Administration + Security + Organization Management

D10
Cross-Product Polish + Mobile + Accessibility + Visual QA

D11
Enterprise Demo / Customer Experience + Final Product Polish
```

Only **D1** is being implemented now.

Do not jump ahead.

---

# 7. D1 SUCCESS CRITERIA

At the end of D1:

```text
Every future workspace has a shared visual foundation.
Every future workspace has a shared shell.
Every future workspace uses shared geometry.
Every future workspace uses shared controls.
Every future workspace uses shared states.
Desktop and mobile share one coherent system.
Light and dark mode share one semantic token model.
The UI is compact, calm and authentic.
No generic AI dashboard styling exists.
```

---

# 8. NO GRADIENT-FIRST DESIGN

This remains an absolute requirement.

Do NOT build the Wamiro design system around:

- gradients
- gradient buttons
- gradient cards
- gradient backgrounds
- neon borders
- glassmorphism
- glowing AI panels

Use:

```text
solid surfaces
+
semantic color
+
typography
+
borders
+
spacing
+
subtle elevation
```

This creates the restrained enterprise feel that we want.

---

# 9. COLOR FOUNDATION

Create semantic tokens.

Suggested:

```text
--w-surface-base
--w-surface-subtle
--w-surface-muted
--w-surface-elevated
--w-surface-sidebar

--w-text-primary
--w-text-secondary
--w-text-tertiary
--w-text-placeholder
--w-text-disabled

--w-border-subtle
--w-border-default
--w-border-strong

--w-brand
--w-brand-hover
--w-brand-active

--w-success
--w-warning
--w-danger
--w-info

--w-focus
--w-selection
```

Most of the application should remain neutral.

Use brand color sparingly.

---

# 10. COLOR USAGE RULE

Color communicates:

```text
Action
Status
Severity
Selection
Link
Unread
```

Color does NOT exist merely to decorate sections.

Avoid creating a situation where every card has a different accent color.

---

# 11. TYPOGRAPHY

Adopt a highly readable system such as:

```text
Inter / Inter Variable
```

Create a small, controlled typography scale.

Suggested application sizes:

```text
11–12px  metadata
13px     compact UI
14px     standard UI
15–16px  content emphasis
18px     page/section title
20–24px  prominent title
```

Use sentence case throughout normal product UI.

Do not use uppercase navigation labels as a visual gimmick.

---

# 12. SPACING

Create a consistent spacing scale:

```text
4
8
12
16
20
24
32
40
48
64
80
```

Use consistent relationships rather than arbitrary spacing.

Dense enterprise UI should still breathe.

---

# 13. RADIUS

Adopt restrained radius values:

```text
4px  micro elements
8px  controls / list items
10px cards
12px dialogs / major surfaces
16px large containers when useful
```

Do not make everything a pill.

Use pill shapes only for appropriate:
- statuses
- compact filters
- tags
- avatars

---

# 14. ELEVATION

Prefer this order:

```text
spacing
↓
surface difference
↓
border
↓
subtle shadow
```

Use stronger shadows only for:

```text
popover
dropdown
dialog
floating panel
```

---

# 15. ICONOGRAPHY

Standardize around one icon system.

Preferred:

```text
Lucide
```

Rules:

- consistent stroke weight
- consistent sizing
- consistent alignment
- labels for important actions
- icon-only controls only when universally understood

Do not mix icon families.

---

# 16. DESKTOP APP SHELL

Build the canonical Wamiro application shell:

```text
┌──────┬────────────────┬─────────────────────────────┐
│ Rail │ Sidebar        │ Header                     │
│      │                ├─────────────────────────────┤
│      │                │                             │
│      │                │ Workspace                  │
│      │                │                             │
│      │                │                             │
└──────┴────────────────┴─────────────────────────────┘
```

The shell is one of the strongest patterns to carry forward from Frappe UI.

Frappe's current DesktopShell documentation demonstrates a composed shell with rail, sidebar, header, and controlled content scrolling. citeturn918404view3

---

# 17. RAIL

Use a narrow rail only for major application/workspace switching.

Possible:

```text
Wamiro
Home
People
Work
Requests
Knowledge
Analytics
Admin
```

The rail should remain visually quiet.

---

# 18. SIDEBAR

Target approximately:

```text
14rem
```

The sidebar contains contextual navigation.

Example:

```text
Howdy Analytics

Home

People
  Directory
  Teams
  Departments
  Organization

Work
  My Work
  Tasks
  Projects
  Goals
  Calendar

Requests
  My Requests
  Approvals
```

The exact menu is role-aware.

Do not expose inaccessible areas.

---

# 19. SIDEBAR ITEM GEOMETRY

Use compact items.

Target roughly:

```text
28–32px
```

desktop navigation item height.

Each item should contain:

```text
icon
label
optional count
```

Active state:

```text
subtle surface
+
clear text/icon
```

No glowing or oversized active states.

---

# 20. TENANT HEADER

The top of the sidebar should show:

```text
[Company logo]

Company name
Workspace
```

Example:

```text
[Logo]

Howdy Analytics
Company workspace
```

If the user belongs to multiple organizations, provide organization switching.

---

# 21. PAGE HEADER

Every workspace should use one canonical page-header structure:

```text
Breadcrumb
Page title

Optional tabs

                             Primary action
                             Secondary actions
```

Example:

```text
People

Employees                            [Add employee]
```

One action should visually dominate.

---

# 22. PAGE HEADER CONTRACT

Build a reusable component with:

```text
title
breadcrumb
subtitle
tabs
primaryAction
secondaryActions
filters
viewSwitcher
```

Do not recreate page headers separately.

---

# 23. CONTENT WIDTH

Do not force all pages into one max width.

Use content modes:

```text
Full-width
Wide
Standard
Reading
Split
```

Examples:

```text
Tables        → full/wide
Dashboards    → wide
Forms         → standard
Knowledge     → reading
Mail          → split
Tickets       → split
```

---

# 24. WORKSPACE ARCHETYPES

Every Wamiro workspace must select a canonical archetype.

Supported:

```text
A. Table
B. Feed
C. Board
D. Two-pane
E. Detail
F. Compose
G. Settings
H. Dashboard
I. Directory / Grid
```

No new arbitrary page structure should be created without design review.

---

# 25. TABLE ARCHETYPE

Use for:

```text
Employees
Requests
Approvals
Tasks
Projects
Tickets
Documents
Expenses
Integrations
Audit
Users
Roles
```

Table capabilities:

- sorting
- filtering
- pagination
- column visibility
- selection
- bulk actions
- saved views
- keyboard navigation
- responsive adaptation

---

# 26. FEED ARCHETYPE

Use for:

```text
Discussions
Activity
Announcements
Notifications
Updates
Company feed
```

Row anatomy:

```text
Avatar
Title
Author / metadata
Excerpt
Counts
Timestamp
Unread indicator
```

Frappe's Discussions recipe demonstrates this compact feed model. Use its structure as a reference, then adapt the content to Wamiro. citeturn918404view0

---

# 27. BOARD ARCHETYPE

Use for:

```text
Requests
Approvals
Projects
Hiring
Onboarding
Workflow pipelines
```

Structure:

```text
Toolbar
↓
Columns
↓
Compact cards
```

Columns should:
- scroll independently
- show counts
- allow drag/reorder where needed
- preserve readable card density

The Frappe Deals recipe is the reference archetype for this, not a limitation to sales.

---

# 28. TWO-PANE ARCHETYPE

Use for:

```text
Mail
Tickets
Messages
Documents
Knowledge
Requests
```

Structure:

```text
List
+
Detail
```

Desktop:

```text
┌─────────────────┬─────────────────────────────┐
│ list            │ detail                      │
│                 │                             │
└─────────────────┴─────────────────────────────┘
```

Mobile:

```text
list route
↓
detail route
```

Do not force split panes onto mobile.

---

# 29. DETAIL ARCHETYPE

Use for:

```text
Employee
Project
Request
Ticket
Document
Role
Integration
```

Structure:

```text
Header
↓
Main content     | Metadata
↓                 |
Activity          |
Related items     |
```

The metadata area should remain quiet and compact.

---

# 30. COMPOSE ARCHETYPE

Use for:

```text
Announcement
Discussion
Knowledge article
Internal message
Policy
Comment
```

Structure:

```text
Breadcrumb
Title
Focused editor
Editor controls
Bottom action area
```

Use a focused reading/writing width rather than a giant full-screen text canvas.

---

# 31. SETTINGS ARCHETYPE

Use:

```text
Settings navigation
+
Settings content
```

Rows:

```text
label
description
control
```

Avoid nested cards.

Support:

```text
Personal settings
Organization settings
Security
Notifications
Integrations
```

---

# 32. DASHBOARD ARCHETYPE

Dashboards must not become card grids.

Use:

```text
Context
↓
Attention
↓
Primary metrics
↓
Action queues
↓
Supporting analysis
```

Only introduce cards where grouping is meaningful.

---

# 33. DIRECTORY / GRID ARCHETYPE

Use for:

```text
Employee directory
Teams
Departments
Applications
Modules
```

Use compact grid/list options.

Do not create a giant collection of oversized profile cards.

---

# 34. FRAPPE RECIPES → WAMIRO REFERENCE MAP

The following are reference patterns:

```text
Discussions
→ Collaboration / Company Feed

Compose
→ Knowledge / Announcements / Posts

Deals
→ Requests / Approvals / Workflows

Tickets
→ IT / Support / Service Desk

Mail
→ Internal Inbox / Messages

Files
→ Documents

Tasks
→ My Work

Accounting
→ Finance / Expenses
```

But many Wamiro workspaces do NOT have an exact Frappe equivalent.

Those must use the nearest established Wamiro archetype.

---

# 35. WAMIRO-ONLY WORKSPACES

The same design system must cover features such as:

```text
Attendance
Leave
Employee Profile
Organization Chart
Goals / OKRs
Approvals
Access Requests
Permission Center
Security Center
Executive Dashboard
AI Assistant
AI Insights
Workflow Builder
System Health
Tenant Management
Integration Center
```

Do not create separate visual systems for these.

---

# 36. FRAPPE IS A RECIPE SOURCE, NOT A PAGE LIMIT

The rule is:

```text
Does Frappe have a similar interaction model?
        ↓
Use it as the reference.

Does Frappe NOT have the feature?
        ↓
Choose the closest Wamiro archetype.

No suitable archetype?
        ↓
Design a new Wamiro pattern and add it to the design system.
```

Once a new pattern is accepted, reuse it across the product.

---

# 37. D1 COMPONENT LIBRARY

Build the following first.

## Core

```text
Button
IconButton
Link
Badge
Avatar
TextInput
Textarea
Select
Combobox
Checkbox
Radio
Switch
DatePicker
Tooltip
Popover
Dropdown
```

## Layout

```text
AppShell
Rail
Sidebar
SidebarSection
SidebarItem
PageHeader
PageTabs
Content
SplitPane
MetaPanel
```

## Data

```text
List
ListRow
ListCell
ListHeader
DataTable
FilterBar
SavedView
BulkActionBar
```

## Feedback

```text
Loading
Skeleton
EmptyState
ErrorState
Toast
Notice
Status
SyncStatus
```

## Content

```text
AvatarGroup
ActivityItem
Timeline
Comment
Composer
Editor
```

---

# 38. D1 PAGE STATES

Every reusable page pattern must support:

```text
Loading
Empty
Populated
Filtered
Error
Not Found
Permission Restricted
Degraded
Saving
Saved
```

This must be standardized before D2 begins.

---

# 39. D1 MOBILE SHELL

Create a first-class mobile shell.

Desktop:

```text
Rail + Sidebar + Header
```

Mobile:

```text
Header
+
Page
+
Bottom navigation
+
Bottom-sheet navigation when deeper sections are needed
```

Do not squeeze the desktop shell into mobile.

---

# 40. D1 DARK MODE

Build semantic dark-mode values for every token.

Audit:

```text
Sidebar
Header
Tables
Rows
Borders
Inputs
Dialogs
Dropdowns
Charts
Status colors
AI surfaces
Focus
Selection
```

Do not simply invert values.

---

# 41. D1 ACCESSIBILITY

Target:

```text
WCAG 2.2 AA
```

Test:

```text
Keyboard
Focus
Screen reader semantics
Contrast
Reduced motion
Zoom
Touch targets
Dialog behavior
Table interaction
```

---

# 42. D1 DENSITY

Provide at least:

```text
Default / Comfortable
```

and prepare the system for:

```text
Compact
```

Do not make compact mode immediately mandatory.

This gives MNC users the option to optimize for high-volume operations later.

---

# 43. D1 PERFORMANCE

Do not build a heavy UI library that ships everything to every route.

Use:

```text
tree shaking
lazy loading
dynamic imports
Server Components
code splitting
virtualized lists
```

Only load workspace-specific functionality when needed.

---

# 44. D1 DOCUMENTATION

Create:

```text
docs/design/

README.md
principles.md
tokens.md
typography.md
navigation.md
workspace-archetypes.md
components.md
states.md
responsive.md
accessibility.md
content.md
```

The workspace archetype file must explain:

```text
When to use
When not to use
Structure
Components
Responsive behavior
Accessibility
Example workspaces
```

---

# 45. D1 DESIGN GOVERNANCE

After D1:

> No workspace team may invent a completely new UI structure without first checking the existing Wamiro archetypes.

Process:

```text
Need a new screen
↓
Find closest archetype
↓
Reuse
↓
If missing, design new pattern
↓
Review
↓
Add to design system
↓
Reuse everywhere
```

This is how the whole product stays coherent.

---

# 46. D1 IMPLEMENTATION ORDER

Execute exactly in this order:

```text
1. Audit existing UI
2. Extract existing component inventory
3. Remove inconsistent one-off styles
4. Establish semantic tokens
5. Establish typography
6. Establish spacing
7. Establish radius
8. Establish elevation
9. Establish icon rules
10. Build AppShell
11. Build Rail
12. Build Sidebar
13. Build PageHeader
14. Build core controls
15. Build List system
16. Build Table system
17. Build SplitPane
18. Build Detail layout
19. Build Settings layout
20. Build Board primitives
21. Build Composer primitives
22. Build shared states
23. Build MobileShell
24. Implement light mode
25. Implement dark mode
26. Implement accessibility baseline
27. Integrate existing MVP screens into the shell
28. Visual QA
29. Performance QA
30. Freeze D1 design system
```

---

# 47. DO NOT REDESIGN ALL WORKSPACES IN D1

Use only a small validation set.

Recommended validation screens:

```text
Employee directory
My Work
Requests
Documents
Admin
```

These should represent several archetypes:

```text
Table
List
Board
Files
Settings
```

If the system works across these five, the foundation is strong enough for D2+.

---

# 48. D1 VALIDATION CRITERIA

The following screens should visibly feel like the same product:

```text
People
My Work
Requests
Documents
Administration
```

Check:

```text
Same sidebar
Same page header
Same typography
Same control heights
Same spacing
Same action hierarchy
Same table/list behavior
Same empty states
Same loading states
Same error states
Same dark mode
Same mobile behavior
```

---

# 49. WHAT D1 MUST NOT DO

Do not:

```text
rewrite backend
rewrite database
replace working features
introduce Vue
introduce a second frontend framework
copy Frappe branding
create gradients
create a new style for each workspace
turn every section into cards
```

D1 is a design-system and shell phase.

---

# 50. FINAL D1 DELIVERABLES

At the end of D1, deliver:

```text
01. Wamiro Design Tokens
02. Wamiro Typography
03. Wamiro Color System
04. Wamiro App Shell
05. Wamiro Rail
06. Wamiro Sidebar
07. Wamiro PageHeader
08. Wamiro List System
09. Wamiro Table System
10. Wamiro Board System
11. Wamiro SplitPane
12. Wamiro Detail Layout
13. Wamiro Settings Layout
14. Wamiro Composer
15. Wamiro Shared States
16. Wamiro Mobile Shell
17. Light Theme
18. Dark Theme
19. Accessibility Baseline
20. Workspace Archetype Documentation
21. Visual QA Baseline
22. D2 Design Backlog
```

---

# 51. D1 DEFINITION OF DONE

D1 is complete only when:

```text
The shell is stable.

The design tokens are centralized.

The typography system is centralized.

The same sidebar works across workspaces.

The same page header works across workspaces.

Tables share one geometry.

Lists share one geometry.

Boards share one geometry.

Detail pages share one geometry.

Settings share one structure.

Empty/error/loading states are standardized.

Mobile has a coherent navigation model.

Light and dark mode are intentional.

Accessibility has been tested.

The five validation workspaces feel like one application.

No generic AI-gradient aesthetic exists.
```

---

# 52. AGENT EXECUTION RULE

The MVP is already working.

Do not stop at an analysis or a mockup.

Implement D1 in the actual Wamiro repository.

For each change:

```text
Inspect
↓
Implement
↓
Run the application
↓
Test interaction
↓
Check permissions
↓
Check responsive behavior
↓
Check dark/light
↓
Check accessibility
↓
Check performance
↓
Polish
↓
Document
```

Do not claim a visual improvement without actually inspecting the result.

---

# 53. FINAL PRINCIPLE

> **Frappe gives us the reference grammar. Wamiro supplies the vocabulary.**

Frappe recipes are not the product boundary.

The final system must be capable of expressing every Wamiro feature through one consistent language.

```text
Same shell
+
Same geometry
+
Same density
+
Same interaction patterns
+
Same states
+
Same visual discipline
```

across:

```text
HR
People
Work
Projects
Requests
Approvals
Knowledge
Documents
IT
Finance
Analytics
AI
Security
Administration
```

The user should never think:

> “This looks like a different module.”

They should think:

> **“This is Wamiro.”**

---

# 54. SOURCE REFERENCES

Frappe UI:
https://ui.frappe.io/

Frappe UI GitHub:
https://github.com/frappe/frappe-ui

Design:
https://github.com/frappe/frappe-ui/blob/main/skills/frappe-ui/DESIGN.md

Tokens:
https://github.com/frappe/frappe-ui/blob/main/skills/frappe-ui/TOKENS.md

DesktopShell:
https://ui.frappe.io/docs/components/desktopshell

Discussions:
https://ui.frappe.io/recipes/demo/discussions-desktop

Compose:
https://ui.frappe.io/recipes/demo/compose-desktop

Deals:
https://ui.frappe.io/recipes/demo/deals-desktop

Tickets:
https://ui.frappe.io/recipes/demo/tickets-desktop

Mail:
https://ui.frappe.io/recipes/demo/mail-desktop

Files:
https://ui.frappe.io/recipes/demo/files-desktop

Tasks:
https://ui.frappe.io/recipes/demo/tasks-desktop

Accounting:
https://ui.frappe.io/recipes/demo/accounting-desktop



Role	Email	Password	What you'll see
CEO + Admin	ceo@howdy.test	Wamiro-Demo-2026!	Company-wide analytics, approvals, admin console
HR Admin	hr@howdy.test	Wamiro-Demo-2026!	Employee management, documents upload, acknowledgements publishing, Frappe sync button
Manager	manager@howdy.test	Wamiro-Demo-2026!	Team tasks/attendance, approvals, team analytics
Employee	employee@howdy.test	Wamiro-Demo-2026!	Self-scoped: own attendance/leave/tasks/assets