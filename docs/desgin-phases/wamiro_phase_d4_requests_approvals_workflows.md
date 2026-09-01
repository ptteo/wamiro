# WAMIRO — PHASE D4
## Requests, Approvals, Workflow & Decision Center
### Strict Frappe-Inspired Visual System + Exact Supplied Palette

**Program:** Wamiro MNC-Grade UI/UX Transformation  
**Phase:** D4 — Requests + Approvals + Workflows  
**Prerequisite:** D1 + D2 + D3 completed  
**Primary objective:** Build a highly structured enterprise Request, Approval and Workflow experience using the exact supplied palette, the Frappe UI design discipline, and the shared Wamiro workspace architecture.

---

# 1. CRITICAL DESIGN DECISION

The uploaded palette is the **single approved application palette for Wamiro D4**.

Do not invent additional application colors.

The approved palette is:

| Token role | Exact color |
|---|---|
| Muted | `#7A7A7A` |
| Light | `#F8F8F8` |
| Border / dark neutral | `#242424` |
| Light surface | `#D9D9D9` |
| Mid muted | `#999999` |
| Secondary accent / unknown | `#BD660E` |
| Dark surface | `#171717` |
| Surface | `#383838` |
| Mid surface | `#AFAFAF` |
| Primary semantic accent | `#C23838` |

These values come directly from the uploaded palette reference.

**Do not replace them with another palette.**

**Do not add arbitrary blues, purples, greens, yellows, gradients, neon colors, or rainbow semantic systems.**

---

# 2. THE MOST IMPORTANT RULE

> **Every Wamiro screen must look deliberately structured.**

The portal must never become:

- a collection of random cards
- a generic SaaS dashboard
- a template with unrelated components
- an AI-generated gradient interface
- a collection of disconnected workspaces

The design hierarchy must be:

```text
Application shell
↓
Workspace context
↓
Primary action
↓
Primary information
↓
Secondary information
↓
Details / history
```

---

# 3. FRAPPE DESIGN DISCIPLINE

Use Frappe UI as the design reference for:

```text
Density
Geometry
Typography
Navigation
List structure
Table structure
Headers
Settings
Split panes
Boards
Detail pages
Mobile behavior
Semantic design tokens
```

Frappe's documented design philosophy emphasizes:

- gray-first visual language
- typography-based hierarchy
- one primary action
- dense but breathable layouts
- fixed trailing alignment
- restrained color
- consistent geometry
- reusable components

The Frappe documentation also uses a shared desktop shell with rail, sidebar, pinned header and a controlled content region.

Wamiro should adopt these principles across **every** workspace, including features Frappe does not provide.

---

# 4. FRAPPE IS THE DESIGN REFERENCE, NOT THE PRODUCT BOUNDARY

The Frappe recipes are references for interaction archetypes:

```text
Discussions → Feed
Compose → Editor / Composer
Deals → Board / Pipeline
Tickets → Service Desk / Request
Mail → Inbox / Two-pane
Files → Document Workspace
Tasks → Work Management
Accounting → Finance Workspace
```

Wamiro also contains unique experiences:

```text
Employee Directory
Employee Profile
Attendance
Leave
Organization Chart
Goals / OKRs
Approvals
Permissions
Security Center
Executive Dashboard
AI
Workflow Builder
Tenant Administration
Integration Center
```

These must use the **same Wamiro design grammar** even when there is no Frappe equivalent.

---

# 5. EXACT PALETTE — DO NOT DEVIATE

## Base palette

```css
--w-muted: #7A7A7A;
--w-light: #F8F8F8;
--w-border: #242424;
--w-surface-light: #D9D9D9;
--w-muted-mid: #999999;
--w-accent-secondary: #BD660E;
--w-surface-dark: #171717;
--w-surface: #383838;
--w-surface-mid: #AFAFAF;
--w-accent: #C23838;
```

These are the only approved visual colors for D4.

---

# 6. COLOR SEMANTICS

Use the exact palette through semantic tokens.

Recommended mapping:

```text
Background
→ #F8F8F8

Primary dark surface
→ #171717

Secondary dark surface
→ #242424

Primary surface
→ #383838

Muted surface
→ #D9D9D9

Mid surface
→ #AFAFAF

Muted text
→ #7A7A7A

Secondary muted
→ #999999

Primary semantic accent
→ #C23838

Secondary semantic accent
→ #BD660E
```

The exact usage may vary between light and dark mode, but the underlying color set must remain exactly these values.

Do not introduce a seventh/eighth/ninth color to "fix" a component.

Use hierarchy, weight, border, opacity where appropriate, and layout rather than inventing colors.

---

# 7. LIGHT MODE

Light mode must primarily use:

```text
Background: #F8F8F8
Surface: #D9D9D9
Muted surface: #AFAFAF
Primary text/dark structure: #242424
Muted text: #7A7A7A / #999999
Accent: #C23838
Secondary accent: #BD660E
```

The exact palette must remain unchanged.

Do not add:
- blue links
- purple accents
- green success colors
- yellow warning colors

unless the product later explicitly changes the approved palette.

For D4, status must be represented through the approved palette and/or non-color cues such as:
- icon
- text
- position
- border style
- weight

---

# 8. DARK MODE

Dark mode must remain inside the same palette:

```text
Primary background: #171717
Secondary background: #242424
Surface: #383838
Muted surface: #AFAFAF where appropriate
Primary light text/surface: #F8F8F8
Muted text: #999999 / #7A7A7A where contrast permits
Accent: #C23838
Secondary accent: #BD660E
```

Do not introduce another dark-only blue/purple/green system.

Dark mode should feel like a deliberate dark product, not a light theme with colors inverted.

---

# 9. STRUCTURE OVER COLOR

Because D4 uses a deliberately narrow palette, visual hierarchy must come primarily from:

```text
Typography
Spacing
Alignment
Surface hierarchy
Borders
Iconography
State labels
Density
```

Do NOT attempt to solve hierarchy by adding colors.

This is one of the most important design constraints of D4.

---

# 10. NO GRADIENTS

Absolute requirement:

```text
NO GRADIENT BACKGROUNDS
NO GRADIENT BUTTONS
NO GRADIENT CARDS
NO GRADIENT HEADER
NO GRADIENT AI PANEL
NO GRADIENT STATUS
```

Do not use gradients even if a component looks "boring" without them.

Make the layout better instead.

---

# 11. NO AI-GENERATED VISUAL STYLE

Do not use:

```text
purple-blue glow
neon border
glassmorphism
floating translucent cards
rainbow analytics
glowing AI icon
large sparkle effects
3D UI elements
oversized rounded cards
```

Wamiro must look like mature enterprise software.

---

# 12. APP SHELL

D4 must reuse the D1 shell:

```text
Rail
+
Sidebar
+
PageHeader
+
Workspace content
```

No new shell.

The shell should be visually quiet.

---

# 13. SIDEBAR STRUCTURE

Recommended:

```text
Requests

My Requests
Needs My Action
Approved
Rejected
Drafts
All Requests

Workflows
Request Types
```

Admin/HR/Manager navigation may reveal additional sections based on permission.

---

# 14. SIDEBAR GEOMETRY

Use the D1/Frappe-inspired compact geometry:

```text
~14rem sidebar
~28–32px navigation item
~48px header
```

Do not inflate desktop navigation controls.

---

# 15. PAGE HEADER

Every D4 workspace uses the same header:

```text
Breadcrumb
Title
Optional subtitle / tabs

Primary action
Secondary actions
```

Examples:

```text
Requests                          [New request]

Approvals                         [Filter]

Workflows                         [Create workflow]
```

One primary action must dominate.

---

# 16. REQUEST CENTER

The Request Center is the unified operational inbox.

Tabs:

```text
My Requests
Needs Action
Pending
Approved
Rejected
Drafts
All
```

Default employee:

```text
My Requests
```

Default approver:

```text
Needs Action
```

---

# 17. REQUEST LIST STRUCTURE

Use the D1 table archetype.

Columns:

```text
Request
Requester
Type
Status
Assignee
Created
Updated
```

Optional:

```text
Priority
Due
Department
Amount
```

Trailing columns must align vertically.

---

# 18. REQUEST ROW STRUCTURE

Example:

```text
Leave request
Rahul Sharma
Annual Leave
Pending
Sarah Khan
24 Aug
```

The title should dominate.

Metadata should be quieter.

Status should be semantic but restrained.

---

# 19. REQUEST DETAIL

Use:

```text
Header
↓
Summary
↓
Details
↓
Supporting information
↓
Approval history
↓
Comments
↓
Activity
```

Metadata:

```text
Requester
Department
Type
Status
Created
Updated
Approver
```

---

# 20. APPROVAL CENTER

Primary question:

> **What decisions do I need to make now?**

Views:

```text
Needs My Action
Delegated
Approved by Me
Rejected by Me
All
```

Do not make Approvals a generic analytics dashboard.

---

# 21. APPROVAL ROW

Compact:

```text
Expense reimbursement
Rahul Sharma
₹24,000
Pending
Submitted 2h ago
```

Primary action:

```text
Review
```

---

# 22. APPROVAL DETAIL

Structure:

```text
Request
↓
Context
↓
Supporting evidence
↓
History
↓
Decision
```

Actions:

```text
Approve
Reject
Request changes
Delegate
```

---

# 23. APPROVAL ACTION HIERARCHY

Normally:

```text
Approve → primary
Reject → secondary/destructive
Request changes → secondary
Delegate → secondary/menu
```

Never make every button equally prominent.

---

# 24. APPROVAL CONFIRMATION

Example:

```text
Approve purchase request?

₹480,000
Marketing equipment

This action completes the current approval step.

[Cancel]
[Approve]
```

For sensitive actions, clearly communicate the consequence.

---

# 25. REJECTION

Use a focused dialog:

```text
Reject request

Reason
[________________]

[Cancel]
[Reject request]
```

---

# 26. REQUEST CHANGES

```text
Request changes

Comment
[________________]

[Send back]
```

---

# 27. DELEGATION

```text
Delegate approval

Delegate to
Until
Reason

[Cancel]
[Delegate]
```

The delegated authority cannot exceed the delegator's authority.

---

# 28. REQUEST STATUS SYSTEM

Use:

```text
Draft
Submitted
Pending
In Review
Approved
Rejected
Canceled
Completed
Failed
```

Centralize the mapping.

---

# 29. STATUS VISUALS USING ONLY APPROVED PALETTE

Example approach:

```text
Draft
→ #7A7A7A / #999999

Submitted
→ #999999

Pending
→ #BD660E

In Review
→ #BD660E

Approved
→ #C23838 only if used as success emphasis in this monochrome palette,
  otherwise use icon/text/weight to distinguish completion

Rejected
→ #C23838

Canceled
→ #7A7A7A

Completed
→ #C23838 with success icon/text

Failed
→ #C23838 with error icon/text
```

IMPORTANT:

Because the approved palette does not contain a conventional green success color or blue information color, **status must not rely on color alone**.

Use:

```text
Icon
+
Label
+
Position
+
Typography
+
Optional border
```

The status system must remain understandable in grayscale.

---

# 30. ACCESSIBLE STATUS

Examples:

```text
✓ Approved
! Pending
× Rejected
○ Draft
• In Review
```

Do not make users infer:

```text
red = rejected
orange = pending
```

without text.

---

# 31. WORKFLOW BUILDER

Build:

```text
Trigger
↓
Condition
↓
Approval
↓
Action
↓
Notification
↓
End
```

Use a visual workflow canvas only because it helps users understand the process.

---

# 32. WORKFLOW NODE STYLE

Nodes should be:

```text
compact
structured
neutral
aligned
minimal
```

Use the approved palette only.

No colorful node rainbow.

---

# 33. WORKFLOW SIDEBAR

When selecting a node:

```text
Name
Type
Configuration
Permissions
Error handling
```

Use the same D1 form/settings components.

---

# 34. WORKFLOW NODE TYPES

Initial:

```text
Trigger
Condition
Approval
Action
Notification
Delay
Webhook
End
```

---

# 35. WORKFLOW CONDITIONS

Support:

```text
equals
not equals
contains
greater than
less than
in list
exists
```

Grouping:

```text
AND
OR
```

---

# 36. WORKFLOW APPROVAL NODE

Approver sources:

```text
Specific user
Manager
Department head
Role
Group
Dynamic approver
```

---

# 37. WORKFLOW ACTION NODE

Examples:

```text
Create notification
Update request
Assign task
Create task
Update employee field
Send email
Call integration
```

---

# 38. WORKFLOW VALIDATION

Show:

```text
✓ Trigger configured
✓ Condition valid
⚠ Approval fallback missing
✕ Notification target missing
```

Use typography and icons, not extra colors.

---

# 39. WORKFLOW VERSIONING

States:

```text
Draft
Published
Archived
```

Published version is immutable.

Editing creates a new version.

---

# 40. WORKFLOW RUN DETAIL

Show:

```text
Workflow
Run ID
Started
Current step
Status
Completed
```

Timeline:

```text
Trigger
↓
Condition
↓
Approval
↓
Action
↓
Completed
```

---

# 41. WORKFLOW FAILURE

```text
Workflow paused

The notification service could not be reached.

[Retry]
[View details]
```

No technical stack traces.

---

# 42. REQUEST FORM BUILDER

Field types:

```text
Text
Textarea
Number
Currency
Date
Date range
Select
Multi-select
User
Department
Team
File
Checkbox
```

---

# 43. FORM BUILDER STRUCTURE

```text
Field list
↓
Reorder
↓
Field settings
```

Settings:

```text
Label
Description
Required
Default
Validation
Visibility
```

---

# 44. CONDITIONAL FIELDS

Support:

```text
Show if
Hide if
Required if
```

Example:

```text
Travel request
→ destination
→ dates
→ estimated cost
```

---

# 45. REQUEST TYPE BUILDER

Each request type defines:

```text
Form
Workflow
Approvers
Notifications
Permissions
SLA
```

---

# 46. SLA

Use:

```text
Priority
Target response
Target completion
Escalation
```

Example:

```text
SLA
2h remaining
```

Visual priority comes from:

```text
label
time
icon
approved accent
```

not from additional colors.

---

# 47. COMMENTS

Reuse the shared Wamiro comments system.

Support:

```text
Text
Mention
Attachment
Reply
```

---

# 48. ATTACHMENTS

Reuse the Wamiro centralized document/file system.

Authorization:

```text
Tenant
+
Request permission
+
Document permission
```

---

# 49. SEARCH

Global search:

```text
Request title
Requester
Type
Status
Department
```

Search is always:

```text
tenant-aware
permission-aware
```

---

# 50. SAVED VIEWS

Default:

```text
My requests
Needs action
Pending
Overdue
High priority
This week
```

Saved view includes:

```text
filters
sorting
columns
layout
```

---

# 51. BULK APPROVALS

If the business rule allows:

```text
Select
Approve
Reject
Assign
Delegate
```

High-impact bulk actions require confirmation.

---

# 52. BULK APPROVAL CONFIRMATION

```text
Approve 17 requests?

Total: ₹248,000

12 expenses
5 purchases

[Cancel]
[Review]
[Approve 17]
```

---

# 53. HR / IT / FINANCE / ACCESS REQUESTS

All use the same Request Center.

Examples:

```text
HR:
Leave
Attendance correction
Employee change

IT:
Hardware
Software
Access
Incident

Finance:
Expense
Purchase
Travel

Administration:
Access
Equipment
Other
```

The visual grammar never changes.

---

# 54. PROVIDER ABSTRACTION

External services remain behind adapters:

```text
Wamiro Request Service
↓
Provider Adapter
↓
Frappe
Zammad
GLPI
OpenProject
Future provider
```

Do not expose vendor UI in Wamiro.

---

# 55. NOTIFICATIONS

Central notification events:

```text
Request created
Approval requested
Approved
Rejected
Changes requested
Escalated
SLA warning
SLA breach
Workflow completed
Workflow failed
```

---

# 56. D4 DESIGN STATES

Every workspace must support:

```text
Loading
Empty
Filtered empty
Populated
Error
Not found
Permission restricted
Degraded provider
Saving
Saved
Processing
```

All use the exact approved palette.

---

# 57. EMPTY STATE STYLE

Example:

```text
No requests yet.

Requests you submit will appear here.

[Create request]
```

No illustration is required.

Use typography and spacing.

---

# 58. APPROVAL EMPTY STATE

```text
You're all caught up.

There are no requests waiting for your decision.
```

---

# 59. WORKFLOW EMPTY STATE

```text
No workflows yet.

Create a workflow to automate approvals and operational processes.

[Create workflow]
```

---

# 60. ERROR STATE

```text
We couldn't load your requests.

Try again.

[Retry]
```

---

# 61. RESPONSIVE DESIGN

Desktop:

```text
Rail
Sidebar
Header
List / Detail
```

Mobile:

```text
Header
List
Detail route
Bottom navigation
```

Workflow builder mobile:

```text
Node list
→
Node configuration
```

Do not force a full graph canvas onto mobile.

---

# 62. ACCESSIBILITY

D4 must support:

```text
Keyboard
Focus-visible
Screen readers
Accessible forms
Accessible tables
Accessible dialogs
Accessible status
Accessible workflow alternatives
Reduced motion
```

Status must remain understandable without color.

---

# 63. PERFORMANCE

Use:

```text
Server-side pagination
Server-side filtering
Indexed search
Virtualization where necessary
Lazy loading
```

Do not load all organizational requests or workflow runs into the browser.

---

# 64. SECURITY

Test:

```text
Employee cannot approve unauthorized request
Manager cannot approve outside scope
Delegation cannot exceed authority
Private requests cannot be discovered
Attachments cannot bypass request permissions
Tenant A cannot access Tenant B requests
Tenant A cannot trigger Tenant B workflows
Exports cannot bypass authorization
```

---

# 65. AUDIT EVENTS

Record:

```text
request.created
request.updated
request.submitted
request.approved
request.rejected
request.changes_requested
request.canceled

approval.created
approval.delegated
approval.approved
approval.rejected

workflow.created
workflow.updated
workflow.published
workflow.archived
workflow.started
workflow.completed
workflow.failed
workflow.canceled
```

---

# 66. D4 VALIDATION SCREENS

Validate:

```text
1. My Requests
2. Request List
3. Request Detail
4. Approval Center
5. Approval Detail
6. Request Form
7. Workflow List
8. Workflow Builder
9. Workflow Run Detail
10. Request Type Builder
11. SLA view
12. Mobile Request
13. Mobile Approval
```

---

# 67. D4 IMPLEMENTATION ORDER

```text
1. Request Center
2. My Requests
3. Request List
4. Request Detail
5. Request status system
6. Request forms
7. Approval Center
8. Approval Detail
9. Approval actions
10. Approval history
11. Comments
12. Attachments
13. Request Types
14. Workflow List
15. Workflow Builder
16. Workflow validation
17. Workflow versioning
18. Workflow run detail
19. Delegation
20. SLA foundation
21. Notifications
22. Search
23. Mobile
24. Permissions
25. Audit
26. Accessibility
27. Performance
28. Exact palette verification
29. Visual QA
30. D5 backlog
```

---

# 68. D4 DELIVERABLES

```text
01. Request Center
02. My Requests
03. Team Requests
04. Approval Center
05. Approval Detail
06. Request Detail
07. Request Forms
08. Request Type Builder
09. Workflow List
10. Workflow Builder
11. Workflow Validation
12. Workflow Versioning
13. Workflow Run Detail
14. Delegation
15. SLA Foundation
16. Notification Integration
17. Search Integration
18. Comments
19. Attachments
20. Mobile Request Experience
21. Mobile Approval Experience
22. Permission UX
23. Audit
24. Exact supplied palette tokens
25. Exact supplied light theme
26. Exact supplied dark theme
27. Accessibility verification
28. Performance verification
29. Visual QA
30. D5 backlog
```

---

# 69. D4 DEFINITION OF DONE

D4 is complete only when:

```text
Requests are unified.

Approvals are unified.

Workflows are reusable.

Request forms are configurable.

Approval permissions are enforced.

Delegation is safe.

Requests are tenant-aware.

Approvals are tenant-aware.

Workflows are tenant-aware.

Search is permission-aware.

Notifications are centralized.

Audit is centralized.

Mobile works.

Light mode uses ONLY:
#F8F8F8
#D9D9D9
#AFAFAF
#7A7A7A
#999999
#242424
#383838
#171717
#BD660E
#C23838

Dark mode uses ONLY the same approved palette.

No gradient has been introduced.

No unrelated UI colors have been introduced.

Every D4 screen uses the D1 shell.

Every D4 screen uses the D1 component grammar.

Every D4 screen is visually structured and aligned.

```

---

# 70. AGENT EXECUTION RULE

The MVP already works.

Do not rewrite business logic merely for visual reasons.

First inspect the current D1/D2/D3 implementation.

Reuse:

```text
D1 design system
D2 People components
D3 Work components
```

For every D4 implementation:

```text
Inspect
↓
Implement
↓
Run
↓
Test workflow
↓
Test permissions
↓
Test tenant isolation
↓
Test light mode
↓
Test dark mode
↓
Check palette compliance
↓
Check accessibility
↓
Check performance
↓
Polish
↓
Document
```

---

# 71. PALETTE COMPLIANCE CHECK

The agent must inspect generated styles and ensure no unapproved application colors appear.

Search code for:

```text
#hex
rgb(
rgba(
hsl(
hsla(
named colors
```

and verify every application color maps to an approved semantic token.

Allowed palette:

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

Exceptions may exist only for:
- external provider logos/assets
- customer-uploaded content
- photographs
- document previews
- user-generated media

Those exceptions must not alter the Wamiro application theme.

---

# 72. FINAL D4 PRINCIPLE

> **Use structure instead of decoration. Use the exact palette instead of adding colors. Use reusable patterns instead of designing every screen from scratch.**

The result should feel:

```text
Quiet
Dense
Structured
Professional
Fast
Consistent
Mature
Authentic
```

not:

```text
Colorful
Gradient-heavy
Decorative
AI-generated
Inconsistent
```

---

# 73. FINAL D4 TARGET

The finished Request/Approval/Workflow experience should feel like:

```text
One Wamiro system
+
Frappe-level UI discipline
+
Exact approved palette
+
Strong enterprise structure
+
Clear decision making
+
Reusable workflows
```

Every screen should look like it belongs to the same product.

---

# 74. OFFICIAL REFERENCES

Frappe UI:

https://ui.frappe.io/

Frappe Design:

https://github.com/frappe/frappe-ui/blob/main/skills/frappe-ui/DESIGN.md

Frappe Tokens:

https://github.com/frappe/frappe-ui/blob/main/skills/frappe-ui/TOKENS.md

Frappe Skill:

https://github.com/frappe/frappe-ui/blob/main/skills/frappe-ui/SKILL.md

Frappe Deals:

https://ui.frappe.io/recipes/demo/deals-desktop

Frappe Tasks:

https://ui.frappe.io/recipes/demo/tasks-desktop

---

# WAMIRO

> **One workplace. One operating system for your organization.**
