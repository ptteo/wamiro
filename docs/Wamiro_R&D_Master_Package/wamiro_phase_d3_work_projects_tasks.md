# WAMIRO — PHASE D3
## Work Management, Projects, Tasks, Goals, Calendar & Team Productivity

**Program:** Wamiro MNC-Grade UI/UX Transformation  
**Phase:** D3 — Work + Projects + Tasks  
**Prerequisite:** D1 Design Foundation + D2 People/Employee Experience completed  
**Primary goal:** Build a unified work-management experience where tasks, projects, goals, calendars, workload, and team execution feel like one native Wamiro workspace.

---

# 1. PHASE D3 MISSION

D3 turns Wamiro from a people-centric portal into a true:

> **Company Work Operating System**

The user should be able to move naturally between:

```text
My Work
↓
Task
↓
Project
↓
Team
↓
Goal
↓
Calendar
↓
Workload
↓
Project outcome
```

without switching visual language or feeling like different software has been embedded.

---

# 2. CORE D3 PRINCIPLE

A task is not just a database row.

A project is not just a list.

A goal is not just a KPI.

Wamiro must connect:

```text
People
+
Tasks
+
Projects
+
Goals
+
Calendar
+
Workload
+
Dependencies
+
Progress
+
Decisions
```

The UI should help users answer:

```text
What am I responsible for?
What is due?
What is blocked?
What is at risk?
Who owns this?
Why does this matter?
What should happen next?
```

---

# 3. D3 SCOPE

D3 includes:

```text
My Work
Tasks
Task Detail
Task Lists
Task Board
Projects
Project Overview
Project Tasks
Project Members
Project Timeline
Project Board
Goals
OKRs
Goal Progress
Calendar
My Calendar
Team Calendar
Workload
Dependencies
Milestones
Recurring Tasks
Saved Views
Task Search
Project Search
Task Filters
Project Filters
Bulk Actions
Activity
Comments
Mentions
Attachments
Notifications related to work
Work Mobile Experience
Work Permission UX
Work Empty / Loading / Error states
```

Do not build advanced portfolio management or autonomous AI agents in D3.

---

# 4. D3 DESIGN SOURCES

Use:

```text
D1 Wamiro Design System
+
D2 People Design Grammar
+
Frappe Tasks recipe
+
Frappe Deals / Board recipe
+
Frappe List/Table patterns
+
Wamiro work-management requirements
```

Frappe's Tasks recipe demonstrates a compact task experience with shared shell, list/board switching, filters, task status, priority, and reusable list primitives. citeturn900986view6turn895406search0

Frappe's Deals recipe provides a board/list pattern with compact columns, filters, sort controls, and one primary action. citeturn900986view3

Use these as archetypes.

Do not force all Wamiro Work features into those exact structures.

---

# 5. WORKSPACE INFORMATION ARCHITECTURE

Recommended:

```text
My Work

  My Tasks
  My Projects
  My Goals
  Calendar

Work

  Projects
  Tasks
  Goals
  Workload

Team

  Team Work
  Team Calendar
  Team Goals

```

Managers and authorized users may additionally see:

```text
Portfolio
Reports
Project Administration
```

Do not expose admin concepts to normal employees.

---

# 6. MY WORK — PRIMARY WORKSPACE

My Work is one of the most important screens in Wamiro.

Its core question:

> **What should I work on now?**

Recommended structure:

```text
Page Header

Today
↓
Due Soon
↓
Priority
↓
Blocked
↓
Recently completed
```

---

# 7. MY WORK HEADER

Example:

```text
My Work

Today · This week · All

[New task]
```

Primary action:

```text
New task
```

Secondary:

```text
Filter
Sort
View
```

Do not overcrowd the header.

---

# 8. MY WORK SUMMARY

Avoid a row of large metric cards.

Use a compact summary:

```text
Today
5 tasks

Due soon
8 tasks

Blocked
2 tasks

At risk
1 task
```

The most important state should receive the strongest hierarchy.

---

# 9. TASK LIST

Default task view:

> **List**

Columns:

```text
Status
Task
Project
Assignee
Priority
Due
```

Optional:

```text
Goal
Estimate
Labels
```

Do not add every possible field by default.

---

# 10. TASK ROW

Recommended:

```text
○   Finish onboarding flow
    People / Q4 Onboarding

    Sarah Khan            High
    Due tomorrow
```

Status control should be lightweight.

The task title should dominate.

---

# 11. TASK STATUS

Standard Wamiro statuses:

```text
Backlog
Todo
In Progress
Blocked
Done
Canceled
```

Organizations may customize these where architecture allows.

Do not create visually unrelated statuses per workspace.

---

# 12. TASK STATUS VISUAL LANGUAGE

Use:

```text
icon
+
semantic color
+
text
```

Do not rely on color alone.

Examples:

```text
○ Todo
◔ In Progress
! Blocked
✓ Done
```

---

# 13. TASK PRIORITY

Recommended:

```text
Low
Medium
High
Urgent
```

Use restrained indicators.

Avoid large colored labels.

---

# 14. TASK DUE DATES

Show relative dates where useful:

```text
Today
Tomorrow
Friday
2 Sep
```

For overdue:

```text
Overdue · 2 days
```

Use danger color only where meaningful.

---

# 15. TASK BOARD

Provide:

```text
List
Board
```

Board:

```text
Backlog
Todo
In Progress
Blocked
Done
```

Use compact cards.

The board should feel operational, not like oversized sticky notes.

---

# 16. BOARD CARD

Task board cards should show:

```text
Task title
Project
Priority
Assignee
Due date
Optional labels
```

Do not display:
- huge descriptions
- oversized avatars
- unnecessary metadata

The purpose is scanning and movement.

---

# 17. BOARD INTERACTIONS

Support:

- drag and drop
- keyboard alternative where practical
- quick status change
- quick assign
- quick due date
- open detail

Columns should scroll independently.

---

# 18. TASK CREATION

Quick task:

```text
Title
Project
Assignee
Due date
Priority
```

Advanced:

```text
Description
Goal
Dependencies
Estimate
Labels
Recurring schedule
Attachments
```

Use progressive disclosure.

Do not force a 15-field form for a simple task.

---

# 19. QUICK TASK CREATION

Support fast entry:

```text
Create task
```

Focus immediately on:

```text
Task title
```

Allow optional inline assignment/date shortcuts.

Example:

```text
Prepare Q4 report · @Rahul · tomorrow · high
```

If this parsing is implemented, it must be reliable and transparent.

---

# 20. TASK DETAIL

Use the D1 Detail archetype.

Structure:

```text
Task Header
↓
Description
↓
Subtasks
↓
Dependencies
↓
Activity
↓
Attachments
```

Right/meta area:

```text
Status
Priority
Assignee
Project
Goal
Due
Estimate
```

---

# 21. TASK ACTIVITY

Use the shared D2 activity timeline.

Events:

```text
Created
Assigned
Status changed
Priority changed
Commented
Attachment added
Due date changed
Completed
```

Keep the timeline compact.

---

# 22. COMMENTS

Comments should support:

```text
text
mentions
attachments
replies where necessary
```

Do not turn task comments into a separate social network.

---

# 23. MENTIONS

Support:

```text
@person
```

Use the same mention UX across:

```text
Tasks
Projects
Discussions
Documents
Knowledge
Requests
```

---

# 24. SUBTASKS

Support inline subtasks:

```text
☐ Prepare report
   ☑ Gather data
   ☐ Validate results
   ☐ Draft summary
```

Do not create a visually separate product for subtasks.

---

# 25. DEPENDENCIES

Support:

```text
blocked by
blocks
related to
```

Example:

```text
Task A
↓ blocks
Task B
```

The user should understand the relationship without needing a graph database UI.

---

# 26. DEPENDENCY UX

On task detail:

```text
Blocked by

UX review

[Open task]
```

For blockers:

```text
This task is blocked by:
UX review

[Open]
```

Avoid making users open a complex dependency manager for every task.

---

# 27. PROJECTS

Projects are the parent work container.

Primary project views:

```text
Overview
Tasks
Board
Timeline
Calendar
Members
Goals
Documents
Activity
```

Use tabs.

Do not create eight top-level navigation entries for each project feature.

---

# 28. PROJECT HEADER

Example:

```text
Project Phoenix

Engineering
In Progress
42 tasks

[Add task]
```

Secondary:

```text
Share
More
```

---

# 29. PROJECT OVERVIEW

Structure:

```text
Project health
↓
Progress
↓
Milestones
↓
Attention
↓
Recent activity
↓
Upcoming
```

Do not create a wall of KPI cards.

---

# 30. PROJECT HEALTH

Use restrained status:

```text
On track
At risk
Blocked
Completed
```

Health should include an explanation where possible.

Example:

```text
At risk

3 milestones are behind schedule.
```

---

# 31. PROJECT PROGRESS

Prefer:

```text
42 / 58 tasks completed
72%
```

with clear context.

Do not use meaningless circular progress decorations.

---

# 32. PROJECT TASKS

Use the same Task List component from My Work.

Do not create a second task-table implementation.

Filter automatically by:

```text
project_id
```

---

# 33. PROJECT BOARD

Use the D1 Board component.

Allow:

```text
status columns
assignee
priority
milestones
filters
```

Keep card geometry identical to My Work boards.

---

# 34. PROJECT TIMELINE

Provide:

```text
milestones
phases
tasks
dependencies
```

The timeline should be:

```text
zoomable
scrollable
readable
```

Do not create an overly complex Gantt editor in the first iteration.

---

# 35. TIMELINE ARCHITECTURE

Use:

```text
left:
task names / hierarchy

right:
timeline

top:
date scale
```

Maintain alignment.

---

# 36. PROJECT CALENDAR

Use calendar view for:

```text
task due dates
milestones
meetings where relevant
```

Do not duplicate the entire organization calendar inside Projects.

Link to the global Calendar.

---

# 37. PROJECT MEMBERS

Use compact People-style list:

```text
Avatar
Name
Role
Team
Responsibility
```

Reuse D2 People components.

Do not build another member-card design.

---

# 38. PROJECT GOALS

Connect projects to organizational goals.

Example:

```text
Project Phoenix

Supports:

Goal
Improve customer onboarding time by 30%
```

This connection is key to an operating-system experience.

---

# 39. GOALS & OKRs

Goal workspace:

```text
Goals
Company
Department
Team
My Goals
```

Recommended hierarchy:

```text
Company Objective
↓
Department Objective
↓
Team Objective
↓
Individual Goal
```

Do not require every organization to use every level.

---

# 40. GOAL DETAIL

Goal page:

```text
Objective
Key Results
Progress
Owner
Contributors
Timeline
Related projects
Activity
```

---

# 41. KEY RESULT DISPLAY

Use:

```text
Current
Target
Progress
Trend
```

Example:

```text
Customer onboarding time

Current: 18 min
Target: 12 min
Progress: 65%
```

Avoid giant colored KPI cards.

---

# 42. GOAL HEALTH

Use:

```text
On track
At risk
Off track
Complete
```

with text and semantic visual indicator.

---

# 43. GOAL → PROJECT CONNECTION

Show:

```text
Goal
↓
Projects contributing
↓
Tasks contributing
```

This gives executives and managers traceability.

---

# 44. GOAL → EMPLOYEE CONNECTION

Employees should see:

```text
My goals
My contribution
My projects
```

Do not create a separate disconnected performance system.

---

# 45. CALENDAR

Wamiro Calendar should become one unified calendar.

Views:

```text
Day
Week
Month
Agenda
```

Data can include:

```text
Meetings
Tasks
Deadlines
Leave
Holidays
Project milestones
Company events
```

---

# 46. CALENDAR DESIGN

Use one calendar component across:

```text
My Calendar
Team Calendar
Project Calendar
Company Calendar
```

Filter context instead of creating separate visual systems.

---

# 47. CALENDAR HEADER

```text
< >
Today

Month / Week / Day

[Create]
[Filter]
```

Primary action:

```text
Create
```

---

# 48. CALENDAR EVENT STYLE

Events should show:

```text
title
time
context
```

Color should communicate source only when useful.

Do not assign 12 random colors to event categories.

---

# 49. TEAM CALENDAR

Managers can filter:

```text
My team
Department
Projects
Leave
```

The team calendar should remain readable with many events.

---

# 50. LEAVE INTEGRATION

Leave appears as:

```text
Rahul — Annual Leave
```

with appropriate semantic styling.

Do not make leave look like a project task.

Use a distinct but consistent status treatment.

---

# 51. WORKLOAD

Workload workspace:

```text
People
↓
Tasks assigned
↓
Capacity
↓
Overload
```

Core question:

> **Who has too much or too little work?**

---

# 52. WORKLOAD TABLE

Columns:

```text
Person
Capacity
Assigned
Remaining
Overdue
Utilization
```

Use subtle heat/semantic indicators.

Avoid rainbow heatmaps.

---

# 53. WORKLOAD DETAIL

Click a person:

```text
Assigned tasks
Deadlines
Projects
Estimated hours
```

Use D2 People components for identity.

---

# 54. WORKLOAD WARNINGS

Example:

```text
Sarah Khan
124% assigned

4 tasks due this week
2 tasks overdue

[View workload]
```

This should be actionable.

---

# 55. WORKLOAD MANAGEMENT

For managers:

```text
Reassign
Change due date
Change priority
Open project
```

Every action requires correct permission.

---

# 56. SAVED WORK VIEWS

Support:

```text
My overdue
This week
High priority
Blocked
My projects
My team's work
```

Saved view includes:

```text
filters
sorting
columns
layout
```

---

# 57. TASK BULK ACTIONS

Support:

```text
Assign
Change status
Change priority
Move project
Set due date
Archive
```

Dangerous actions require confirmation.

---

# 58. PROJECT BULK ACTIONS

Where practical:

```text
Archive
Change owner
Change status
Add member
Export
```

Do not overbuild bulk project management.

---

# 59. TASK TEMPLATES

Future-ready task templates:

```text
Task template
Checklist
Default assignee
Default priority
Default duration
```

Useful for repetitive workflows.

---

# 60. PROJECT TEMPLATES

Prepare:

```text
Project template
Default phases
Default tasks
Default goals
Default members
```

Templates should be configurable and reusable.

---

# 61. RECURRING TASKS

Use one clear pattern:

```text
Repeat:
Daily
Weekly
Monthly
Custom
```

Show next occurrence.

Do not create separate recurring-task screens.

---

# 62. DEADLINES

Deadline display should be contextual:

```text
Today
Due tomorrow
Due Friday
Overdue by 3 days
```

Use danger semantic color only when action is required.

---

# 63. ATTENTION SYSTEM

A cross-work surface should identify:

```text
Overdue
Blocked
At risk
Waiting
Needs approval
```

This can later power:

```text
Daily Brief
Manager Brief
Executive Brief
```

Do not implement full AI briefing in D3 unless already required.

---

# 64. WORK NOTIFICATIONS

Notifications for:

```text
Assigned task
Mention
Task due
Task overdue
Project update
Goal update
Comment
Approval
Dependency changed
```

Use the central D1 notification system.

Do not create a separate Work notification center.

---

# 65. WORK SEARCH

Global search should find:

```text
Tasks
Projects
Goals
Milestones
People
```

Search result format should follow D1.

---

# 66. WORK PERMISSIONS

Employee:

```text
own tasks
assigned projects
authorized goals
```

Manager:

```text
team tasks
team projects
team workload
```

Project owner:

```text
project administration
```

Admin:

```text
global work configuration
```

Do not automatically give managers company-wide project visibility.

---

# 67. PROJECT PERMISSION MODEL

Support:

```text
Project visibility
Project roles
Task permissions
Membership
```

Example:

```text
Private
Team
Department
Company
```

Project visibility must not bypass organization permissions.

---

# 68. WORK TENANT ISOLATION

Every:

```text
Task
Project
Goal
Calendar event
Workload record
Attachment
Comment
```

must remain tenant scoped.

Cross-tenant work data is a critical security failure.

---

# 69. WORK ACTIVITY

Use the common timeline.

Examples:

```text
Task assigned
Project created
Member added
Goal updated
Deadline changed
Task completed
Comment added
```

Keep it compact.

---

# 70. ATTACHMENTS

Tasks and projects may support attachments.

Use the D1/D2 document architecture.

Do not create a separate upload system.

Attachment access must inherit:
- tenant
- resource permission
- document permission

---

# 71. WORK MOBILE

Mobile priority:

```text
My Work
Task detail
Quick complete
Comments
Due dates
Approvals
Calendar
```

Users should be able to:

```text
open task
complete task
comment
change status
```

with minimal friction.

---

# 72. MOBILE TASK DETAIL

Structure:

```text
Task title
Status
Primary action
Metadata
Description
Subtasks
Activity
```

Avoid large multi-column desktop layouts.

---

# 73. MOBILE BOARD

If board is implemented on mobile:

```text
horizontal swipe
```

or:

```text
column picker
```

Do not make five columns simultaneously visible.

---

# 74. MOBILE PROJECT

Tabs may become a compact section selector:

```text
Overview
Tasks
Timeline
Members
```

Do not overflow the header with 10 tabs.

---

# 75. WORK EMPTY STATES

My Work:

```text
You're clear.

No tasks need your attention today.
```

Alternative CTA:

```text
Browse projects
```

Projects:

```text
No projects yet.

Create a project to organize work.

[Create project]
```

Goals:

```text
No goals assigned.

Your goals will appear here when they are created.
```

---

# 76. WORK LOADING

Use:
- row skeletons
- board skeleton columns
- project header skeleton
- timeline skeleton

Keep navigation interactive.

---

# 77. WORK ERROR

Example:

```text
We couldn't load your tasks.

Try again or check back shortly.

[Retry]
```

Avoid:
```text
500 Internal Server Error
```

---

# 78. WORK DEGRADED INTEGRATION

If an external project engine is unavailable:

```text
Project data is temporarily unavailable.

Some work features remain available.

[Retry]
```

Do not crash the whole Wamiro workspace.

---

# 79. PROJECT HEALTH

Project health must be understandable without deep analytics.

Show:

```text
Status
Progress
Deadline
Milestones
Risk
```

Use short explanation.

---

# 80. PROJECT RISK

Example:

```text
At risk

2 milestones are overdue.
```

Allow:

```text
View milestones
```

Do not use an abstract numeric "risk score" unless meaningful.

---

# 81. GOAL HEALTH

Use the same status language as projects:

```text
On track
At risk
Off track
Complete
```

This consistency matters.

---

# 82. CROSS-MODULE WORK CONNECTIONS

A project may connect to:

```text
People
Goals
Tasks
Documents
Calendar
Requests
Analytics
```

The UI should expose those relationships.

---

# 83. PROJECT CONTEXT NAVIGATION

Example:

```text
Project Phoenix

Overview
Tasks
Timeline
Calendar
Members
Goals
Documents
Activity
```

Use compact tabs.

---

# 84. TASK CONTEXT NAVIGATION

Task detail should link:

```text
Project
Goal
Assignee
Related tasks
```

Avoid duplicate metadata.

---

# 85. GOAL CONTEXT NAVIGATION

Goal detail should link:

```text
Owner
Team
Department
Projects
Key results
```

---

# 86. CALENDAR CONTEXT

Calendar event should allow:

```text
Open task
Open project
Open meeting
Open leave
```

Context should be preserved.

---

# 87. WORKSPACE CONSISTENCY

Every D3 workspace must use:

```text
D1 shell
D1 typography
D1 tokens
D1 controls
D1 tables
D1 lists
D1 boards
D1 detail pages
D1 states
D1 mobile model
```

No new styling system.

---

# 88. Frappe RECIPE INFLUENCE

Use:

### Frappe Tasks
For:
```text
My Work
Tasks
Task list
Task board
```

### Frappe Deals
For:
```text
Approval pipelines
Project workflows
Request boards
```

But extend these patterns for:

```text
Goals
Dependencies
Workload
Milestones
Project health
```

These are Wamiro-specific needs.

---

# 89. DESIGN ANTI-PATTERNS

Do not create:

```text
giant Kanban cards
rainbow project status
massive progress rings
three-dimensional charts
huge KPI cards
gradient project headers
oversized avatars
decorative Gantt graphics
```

Work management should look operational and mature.

---

# 90. PERFORMANCE

D3 must handle:

```text
100 tasks
1,000 tasks
10,000 tasks
100,000+ task records
```

Use:

```text
server-side filtering
pagination
virtualization
lazy loading
cached metadata
optimized queries
```

Do not render thousands of task cards simultaneously.

---

# 91. TASK SEARCH PERFORMANCE

Search must feel instant.

Use:
- indexed fields
- debounced input
- server-side filtering
- search index when scale requires it

No full-table browser filtering for large datasets.

---

# 92. BOARD PERFORMANCE

For large boards:

```text
virtualize where practical
lazy-load cards
paginate within columns when needed
```

Do not fetch every task in a 10,000-task project just to render the first viewport.

---

# 93. CALENDAR PERFORMANCE

Do not load:
```text
all company events
```
into the browser.

Use:
```text
date-range queries
```

and load additional data when navigation occurs.

---

# 94. ACCESSIBILITY

Test:

```text
Task list keyboard navigation
Table sorting
Board drag alternative
Task completion
Date picker
Calendar
Filters
Dialogs
```

A drag-only workflow must always have another accessible method.

---

# 95. D3 SECURITY

Test:

```text
Employee cannot edit unauthorized task
Manager cannot edit unrelated team work
Private project cannot be discovered
Hidden goal cannot appear in search
Unauthorized calendar event cannot be opened
Unauthorized attachment cannot be accessed
```

---

# 96. D3 AUDIT

Audit:

```text
Task created
Task assigned
Task completed
Task deleted/archived
Project created
Project owner changed
Project member added
Goal changed
Deadline changed
Permission changed
Bulk operation
Export
```

---

# 97. D3 INTEGRATION MODEL

If Wamiro uses an external project-management engine:

```text
Work UI
↓
Wamiro work service
↓
Project provider adapter
↓
OpenProject / future provider
```

Do not expose provider-specific UX.

---

# 98. PROJECT PROVIDER ABSTRACTION

Prepare:

```text
ProjectProvider
```

with operations such as:

```text
getProject
createProject
updateProject
getTasks
createTask
updateTask
completeTask
getMembers
getTimeline
```

Keep provider integration separate from UI.

---

# 99. WORK EVENT MODEL

Use domain events:

```text
task.created
task.assigned
task.completed
task.blocked
task.overdue

project.created
project.updated
project.at_risk
project.completed

goal.created
goal.updated
goal.at_risk
goal.completed
```

These later feed:

```text
notifications
analytics
AI
automation
audit
```

---

# 100. D3 VALIDATION SCREENS

Before completing D3, validate:

```text
1. My Work
2. Task List
3. Task Board
4. Task Detail
5. Project Overview
6. Project Tasks
7. Project Timeline
8. Goals
9. Calendar
10. Workload
```

All must look like one Wamiro product.

---

# 101. D3 IMPLEMENTATION ORDER

```text
1. My Work
2. Task List
3. Task Detail
4. Task Board
5. Task creation/edit
6. Task activity/comments
7. Project shell
8. Project overview
9. Project tasks
10. Project board
11. Project timeline
12. Project members
13. Goals
14. Goal detail
15. Calendar
16. Team calendar
17. Workload
18. Saved work views
19. Bulk actions
20. Mobile Work
21. Permissions
22. Audit
23. Accessibility
24. Performance
25. Visual QA
26. D4 backlog
```

---

# 102. D3 DELIVERABLES

At completion:

```text
01. My Work
02. Task List
03. Task Board
04. Task Detail
05. Quick Task Creation
06. Subtasks
07. Dependencies
08. Comments/Mentions
09. Projects
10. Project Overview
11. Project Tasks
12. Project Board
13. Project Timeline
14. Project Calendar
15. Project Members
16. Goals / OKRs
17. Goal Detail
18. Calendar
19. Team Calendar
20. Workload
21. Saved Views
22. Bulk Work Actions
23. Mobile Work Experience
24. Work Permission UX
25. Work Audit
26. Work Error/Empty/Loading states
27. Performance baseline
28. Accessibility verification
29. D4 backlog
```

---

# 103. D3 DEFINITION OF DONE

D3 is complete only when:

```text
My Work is genuinely useful every day.

Tasks use one consistent task system.

Projects use one consistent project system.

Boards and lists share common geometry.

Goals connect to projects and work.

Calendar connects to work.

Workload connects people to work.

All work data is permission-aware.

All work data is tenant-aware.

Mobile supports real actions.

Large datasets remain usable.

Loading/empty/error states are consistent.

Light/dark mode work.

All D3 workspaces visually belong to Wamiro.
```

---

# 104. AGENT EXECUTION RULE

The MVP already works.

Do not create a parallel work-management product.

Inspect what already exists.

Reuse D1 and D2 components.

Preserve existing task/project data.

If a work engine is already integrated, redesign the experience without unnecessarily replacing the engine.

For each feature:

```text
Inspect
↓
Reuse
↓
Implement
↓
Test
↓
Security review
↓
Tenant review
↓
Accessibility review
↓
Performance review
↓
Polish
↓
Document
```

---

# 105. FINAL D3 PRINCIPLE

> **Wamiro should make work understandable, not just manageable.**

A user should be able to answer immediately:

```text
What am I doing?
Why am I doing it?
When is it due?
What is blocking me?
Who is involved?
What project is it part of?
What goal does it support?
What should I do next?
```

The design should communicate those relationships without becoming visually complicated.

---

# 106. FINAL D3 TARGET

The completed Work experience should feel:

```text
Fast
Focused
Dense
Calm
Connected
Predictable
Action-oriented
Enterprise-grade
```

and use the same Wamiro visual grammar established in D1 and D2.

---

# WAMIRO

> **One workplace. One operating system for your organization.**
