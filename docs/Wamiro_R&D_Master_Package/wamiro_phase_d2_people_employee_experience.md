# WAMIRO — PHASE D2
## People, Employee Experience & Organizational Workspace

**Program:** Wamiro MNC-Grade UI/UX Transformation  
**Phase:** D2 — People + Employee Experience  
**Prerequisite:** D1 completed and design foundation frozen  
**Primary goal:** Redesign every people-related experience so employees, managers, HR, and executives can understand people and organizational information quickly, while every screen uses the same Wamiro design grammar established in D1.

---

# 1. PHASE D2 MISSION

D1 established the visual and interaction foundation.

D2 turns that foundation into the first major end-to-end Wamiro workspace family:

```text
People
+
Employees
+
Teams
+
Departments
+
Organization
+
My Profile
+
Attendance
+
Leave
+
Employee Activity
+
Manager Context
```

The objective is not to create isolated "HR screens."

The objective is:

> **Build the best people experience inside Wamiro.**

People-related screens should feel like one connected workspace.

---

# 2. CORE DESIGN PRINCIPLE

The employee is not merely a row in an HR table.

The employee is:

```text
Person
+
Role
+
Team
+
Organization
+
Work
+
Attendance
+
Leave
+
Documents
+
Activity
+
Permissions
```

Therefore Wamiro should allow users to move naturally between:

```text
Directory
↓
Employee
↓
Team
↓
Department
↓
Work
↓
Attendance
↓
Leave
↓
Documents
↓
Activity
```

without feeling like they are switching applications.

---

# 3. D2 SCOPE

D2 covers:

```text
Employee Directory
Employee Search
Employee Profiles
Employee Overview
Employee Work
Employee Attendance
Employee Leave
Teams
Departments
Organization Chart
Managers
My Profile
My Preferences
Employee Activity
People Filters
People Search
People Views
People Detail
People Mobile
People Permissions UX
People Empty / Error / Loading states
People Analytics foundations
```

Do not build advanced performance-management or full recruitment UX in D2.

Those belong to later phases unless already present and required by the working MVP.

---

# 4. D2 DESIGN SOURCE

Use:

```text
D1 Wamiro Design System
+
Frappe-style List/Table discipline
+
Frappe-style Detail page structure
+
Frappe-style Sidebar/PageHeader
+
Frappe-style compact density
+
Wamiro-specific People requirements
```

Frappe recipes are references.

They are NOT the complete solution for Wamiro People.

Where Frappe provides no exact equivalent, choose the closest Wamiro archetype from D1.

---

# 5. PEOPLE INFORMATION ARCHITECTURE

Recommended People workspace:

```text
People

  Directory
  Teams
  Departments
  Organization
  My Profile

  Attendance
  Leave
```

Admin/HR may additionally see:

```text
Employee Management
Employee Lifecycle
People Analytics
Policies
```

Employees should see only the views relevant to their permissions.

---

# 6. PEOPLE WORKSPACE SHELL

Use the D1 shell unchanged:

```text
Rail
+
Sidebar
+
PageHeader
+
Workspace content
```

People must not introduce a new visual shell.

---

# 7. PEOPLE SIDEBAR

Recommended:

```text
People

Directory
Teams
Departments
Organization

My profile

Attendance
Leave
```

Role-specific expansion:

```text
HR
Employee Management
Lifecycle
People Analytics
```

Manager:

```text
My Team
Team Attendance
Team Leave
```

Do not show unauthorized items.

---

# 8. PEOPLE HOME

If a People overview page exists, it should not be another KPI-card dashboard.

Use:

```text
People
─────────────
Search / filters

Recently viewed
People needing attention
Teams
Departments

Quick actions
```

Primary action for HR/Admin:

```text
Add employee
```

Primary action for normal employees:

```text
Search people
```

---

# 9. EMPLOYEE DIRECTORY

The Employee Directory is one of the most important Wamiro screens.

Default archetype:

> **Table/List**

Do NOT default to giant employee cards.

Recommended columns:

```text
Employee
Role
Department
Team
Location
Manager
Status
```

Optional:

```text
Last active
Employment type
Join date
```

Sensitive information must not appear unless authorized.

---

# 10. DIRECTORY ROW DESIGN

Recommended row:

```text
[Avatar]  Rahul Sharma
          Senior Software Engineer
          Engineering

Department        Team           Location
Engineering       Platform       Bengaluru
```

But maintain compact table alignment for dense views.

Use a secondary line only when it meaningfully helps scanning.

---

# 11. DIRECTORY ACTIONS

Primary:

```text
Add employee
```

Secondary:

```text
Import
Export
Filters
Columns
Saved view
```

Exports must be permission-aware and auditable.

---

# 12. DIRECTORY SEARCH

Search by:

```text
Name
Email
Employee ID
Job title
Department
Team
Location
Manager
Skills
```

Search should feel immediate.

Use global search and People-specific filters together.

---

# 13. DIRECTORY FILTERS

Useful filters:

```text
Department
Team
Location
Manager
Status
Employment type
Job title
```

Use compact filter controls.

Do not open an enormous filter form for everyday filtering.

Advanced filters can use a popover/drawer.

---

# 14. SAVED PEOPLE VIEWS

Support saved views such as:

```text
Engineering
My team
New hires
Remote employees
Managers
Active employees
On leave
```

Saved views should retain:

```text
filters
sorting
columns
```

and remain permission-aware.

---

# 15. DIRECTORY DENSITY

Default:

```text
Compact / comfortable
```

Future:

```text
Dense
```

should support HR/admin users managing hundreds or thousands of employees.

Do not sacrifice readability.

---

# 16. BULK PEOPLE ACTIONS

For HR/Admin:

```text
Selected: 24

Assign department
Assign team
Update status
Export
More
```

High-risk actions require confirmation.

Example:

```text
Suspend 24 users?

All selected users will lose access.

[Cancel]
[Suspend 24]
```

---

# 17. EMPLOYEE PROFILE

Employee Profile is the central People detail experience.

Structure:

```text
Header
↓
Overview
↓
Work
↓
Attendance
↓
Leave
↓
Documents
↓
Activity
```

Use the D1 Detail archetype.

---

# 18. EMPLOYEE PROFILE HEADER

Header:

```text
Avatar
Name
Job title
Department
Team
Status
```

Actions:

```text
Message
View work
Attendance
Leave
More
```

Admin/HR may additionally see:

```text
Edit
Manage access
Suspend
Offboarding
```

Only show authorized actions.

---

# 19. EMPLOYEE PROFILE METADATA

Right metadata panel or compact information block:

```text
Department
Team
Manager
Location
Employment type
Status
Joined
```

Use quiet labels.

Values should have stronger visual weight than labels.

---

# 20. EMPLOYEE PROFILE TABS

Recommended:

```text
Overview
Work
Attendance
Leave
Documents
Activity
```

HR/Admin may have:

```text
Employment
Access
Performance
Lifecycle
```

Do not create 12 tabs by default.

Use progressive disclosure.

---

# 21. EMPLOYEE OVERVIEW

The Overview should tell the user who this person is.

Suggested:

```text
Profile summary
Organization
Current work
Upcoming
Recent activity
```

Avoid creating an employee dashboard filled with generic metrics.

---

# 22. EMPLOYEE WORK

Show:

```text
Current projects
Tasks
Goals
Upcoming deadlines
Recent work
```

Use links into the Work workspace.

Do not duplicate the entire project-management engine here.

---

# 23. EMPLOYEE ATTENDANCE

Attendance should be a dedicated workspace using the same Wamiro shell.

Employee view:

```text
Today
Current status
Clock In / Clock Out

Recent history
Calendar
Hours
Attendance requests
```

Manager view:

```text
Team attendance
```

HR view:

```text
Organization attendance
```

---

# 24. ATTENDANCE PRIMARY ACTION

For employees:

```text
Clock In
```

or:

```text
Clock Out
```

should be the single visually dominant action.

Avoid a dashboard of attendance cards.

---

# 25. CLOCKED-IN STATE

When active:

```text
Clocked in
09:24 AM

Today
04h 18m

[Clock out]
```

Keep the interface calm.

Do not use giant animated timers.

---

# 26. ATTENDANCE HISTORY

Default archetype:

> Table + calendar summary

Columns:

```text
Date
Status
Clock in
Clock out
Hours
Notes
```

Use semantic status:

```text
Present
Late
Absent
Leave
Holiday
Remote
```

---

# 27. ATTENDANCE CALENDAR

Optional alternate view:

```text
Month
Week
```

Color should be semantic and restrained.

Avoid rainbow calendars.

---

# 28. ATTENDANCE CORRECTION

Employee:

```text
Request correction
```

Flow:

```text
Date
Issue
Requested time
Reason
Submit
```

Manager/HR sees:

```text
Pending corrections
```

Use the same Request/Approval grammar defined in D1.

---

# 29. TEAM ATTENDANCE

Manager view:

```text
Team
Present
Late
On leave
Absent
Remote
```

Default table:

```text
Employee
Status
Clock in
Hours
Notes
```

Primary interaction:

```text
View employee
```

Do not overwhelm managers with charts.

---

# 30. HR ATTENDANCE

HR may use:

```text
Department filter
Location filter
Date range
Status filter
```

and can access more detailed operational data subject to authorization.

---

# 31. LEAVE WORKSPACE

Leave should use a consistent:

```text
Summary
+
Balance
+
Requests
+
Calendar
```

experience.

---

# 32. MY LEAVE

Employee view:

```text
Leave balance
Upcoming leave
Recent requests
Holiday calendar
Apply leave
```

Primary action:

```text
Apply leave
```

---

# 33. LEAVE BALANCE

Keep it simple:

```text
Annual Leave
14 days remaining

Used
6 days

Upcoming
4 days
```

Avoid multiple oversized cards.

A compact summary section is preferable.

---

# 34. APPLY LEAVE

Use a clean form:

```text
Leave type
Start date
End date
Duration
Reason
Attachments
```

Show availability before submission.

Avoid forcing the user to navigate through separate screens for each field.

---

# 35. LEAVE REQUEST STATUS

Use compact status:

```text
Pending
Approved
Rejected
Cancelled
```

Show:

```text
Requester
Dates
Type
Submitted
Approver
Status
```

---

# 36. LEAVE CALENDAR

Support:

```text
Month
Team
Department
```

where authorized.

For managers:

```text
Team leave calendar
```

This should visually resemble the rest of Wamiro's calendar and table systems.

---

# 37. TEAM VIEW

Team detail page:

```text
Team name
Manager
Members
Department

Work
Attendance
Leave
Goals
Announcements
```

Main archetype:

> Detail + tabs

---

# 38. TEAM MEMBERS

Use a compact list/table:

```text
Employee
Role
Status
Workload
Location
```

For managers, workload can be displayed if authorized.

---

# 39. TEAM HEADER

Example:

```text
Engineering Platform Team

18 members
Manager: Sarah Khan

[Add member]
```

Primary action:

```text
Add member
```

for authorized users.

---

# 40. TEAM ACTIVITY

Quiet timeline:

```text
Sarah joined the team
Project Phoenix started
3 members completed onboarding
New policy published
```

Do not turn each activity into a card.

---

# 41. DEPARTMENT VIEW

Department page:

```text
Department name
Head
Member count

Teams
People
Projects
Goals
Analytics
```

Use tabs.

---

# 42. ORGANIZATION CHART

The organization chart must not be a giant static tree.

Support:

```text
Search
Zoom
Pan
Department filter
Manager filter
Employee focus
```

Interactions:

```text
Click person
→ Profile

Click team
→ Team

Click department
→ Department
```

---

# 43. ORG CHART MOBILE

On mobile:

```text
Search
+
hierarchical list
```

rather than attempting to display the full tree.

---

# 44. MY PROFILE

Employee's own profile should feel personal but still enterprise-consistent.

Sections:

```text
Profile
Work
Contact
Preferences
Security
Sessions
```

Primary action:

```text
Edit profile
```

where allowed.

---

# 45. PROFILE EDITING

Use inline or drawer editing for small changes.

Use a dedicated page for complex employee information.

Do not open nested modals.

---

# 46. PROFILE AVATAR

Support:

```text
Upload
Remove
Change
```

Use consistent cropping and sizing.

Do not turn avatar editing into an oversized image tool.

---

# 47. PERSONAL SETTINGS

Employee can configure:

```text
Theme
Language
Timezone
Notifications
Default workspace
```

Keep account/security controls distinct.

---

# 48. PEOPLE ACTIVITY

Use one timeline model across Wamiro.

Example:

```text
14:32
Rahul completed Project Phoenix task

11:08
Leave approved

Yesterday
Profile updated
```

Activity should be:
- compact
- chronological
- permission-safe

---

# 49. ACTIVITY FILTERS

Where useful:

```text
All
Work
Attendance
Leave
Requests
Documents
Security
```

Do not show categories the user cannot access.

---

# 50. EMPLOYEE SEARCH RESULT

Global search result:

```text
[Avatar]
Rahul Sharma
Senior Software Engineer

Engineering · Platform
Bengaluru

Open profile →
```

Search result should use the same typography and spacing as the Directory.

---

# 51. EMPLOYEE QUICK PREVIEW

Optional quick preview drawer:

```text
Avatar
Name
Title
Department
Team
Manager

[Open profile]
```

Do not duplicate the complete profile in a drawer.

---

# 52. PEOPLE PERMISSIONS UX

Employees should never see restricted sensitive information.

Examples:

```text
Salary
Performance
Personal documents
Security information
```

UI may hide them.

If a user knows a section exists but lacks access:

```text
Restricted
You don't have access to this information.
```

Do not reveal unnecessary details.

---

# 53. HR ADMIN EXPERIENCE

HR can have richer navigation:

```text
People
  Directory
  Teams
  Departments
  Organization

Lifecycle
  Onboarding
  Offboarding

Attendance
Leave

Analytics
```

Keep HR navigation inside the same D1 shell.

---

# 54. MANAGER EXPERIENCE

Manager navigation:

```text
People
  My Team
  Directory

Work
  My Work
  Team Work

Attendance
  Team Attendance

Leave
  Team Leave

Approvals
```

Use the same interface components.

---

# 55. CEO PEOPLE EXPERIENCE

Executive people view should not become HR administration.

Show:

```text
Workforce
Headcount
Departments
Locations
Hiring / movement where authorized
Organization trends
```

Focus on business understanding.

---

# 56. PEOPLE SEARCH + GLOBAL SEARCH

Search architecture:

```text
Global Search
     ↓
People result
     ↓
Directory
     ↓
Profile
```

The user should experience this as one continuous flow.

---

# 57. PEOPLE FILTER BAR

Create reusable:

```text
PeopleFilterBar
```

with:

```text
Department
Team
Location
Status
Manager
Employment type
```

It should be composable.

Do not implement a separate filter UX for every People screen.

---

# 58. PEOPLE TABLE COMPONENT

Build:

```text
PeopleTable
```

on top of the D1 DataTable.

Features:

- avatar
- identity
- metadata
- status
- role
- manager
- quick actions

Do not create a new table system.

---

# 59. PEOPLE MOBILE LIST

Mobile row:

```text
[Avatar]
Rahul Sharma
Senior Engineer
Engineering

⋯
```

Tap opens:

```text
/people/[id]
```

Do not use hover-dependent actions.

---

# 60. PEOPLE MOBILE DETAIL

Mobile structure:

```text
Header
↓
Primary actions
↓
Overview
↓
Tabs/sections
```

Metadata should collapse into compact rows.

---

# 61. PEOPLE EMPTY STATES

Directory:

```text
No employees found.

Try clearing a filter or searching another name.
```

New organization:

```text
Your employee directory is empty.

Invite your first employees to start building your organization.

[Invite employees]
```

Do not show generic:

```text
No data
```

---

# 62. PEOPLE LOADING STATES

Use table skeletons and row skeletons.

Do not use a full-screen "Loading People..." screen when the shell can remain visible.

---

# 63. PEOPLE ERROR STATES

Example:

```text
We couldn't load the directory.

Your organization data is temporarily unavailable.

[Retry]
```

Avoid technical service names.

---

# 64. PEOPLE DEGRADED STATE

If HR integration is unavailable:

```text
Attendance data temporarily unavailable.

Employee profiles and the rest of Wamiro remain available.

[Retry]
```

The entire People workspace should not collapse because one domain integration is down.

---

# 65. PEOPLE DATA FRESHNESS

If external HR data is synchronized asynchronously:

```text
Updated 4 minutes ago
```

Show freshness where it matters.

Do not imply real-time data if it is not actually real-time.

---

# 66. PEOPLE DESIGN FOR MNC SCALE

The People experience should remain usable for:

```text
10 people
100 people
1,000 people
10,000 people
100,000+ people
```

Use:

```text
server-side search
pagination
filters
virtualization where required
saved views
department hierarchy
```

Do not send every employee to the browser.

---

# 67. PEOPLE PERFORMANCE

Measure:

```text
Directory load
Search latency
Filter latency
Profile navigation
Attendance load
Leave balance load
```

Avoid N+1 employee-profile queries.

---

# 68. PEOPLE SECURITY

Test:

```text
Employee cannot view unauthorized employee information
Manager cannot access unrelated teams
HR can see only permitted sensitive data
CEO sees only approved executive information
Tenant A cannot access Tenant B employees
```

---

# 69. PEOPLE AUDIT

Audit important actions:

```text
Employee created
Employee updated
Department changed
Team changed
Manager changed
Status changed
Profile access where required
Attendance correction
Leave approval
Permission change
```

Do not log unnecessary sensitive details.

---

# 70. PEOPLE INTEGRATION BOUNDARY

Wamiro may integrate with Frappe HR.

The People UI should remain Wamiro-native.

Do not expose:

```text
Frappe HR
```

to normal users.

Users see:

```text
People
Attendance
Leave
```

The underlying provider remains an implementation detail.

---

# 71. HR PROVIDER ADAPTER

People UI should consume:

```text
HRProvider
```

rather than importing provider-specific APIs into UI components.

Concept:

```text
People UI
↓
Wamiro domain service
↓
HRProvider
↓
Frappe / future provider
```

This keeps the design stable if a customer uses another HR system later.

---

# 72. PEOPLE WORKSPACE RECIPE

Create one reusable People recipe:

```text
PeopleShell
+
PeopleSidebar
+
PeopleHeader
+
PeopleFilters
+
PeopleList
+
PeopleDetail
+
PeopleActivity
```

Use it for:

```text
Directory
Teams
Departments
Organization
```

---

# 73. EMPLOYEE DETAIL RECIPE

Create:

```text
EmployeeDetail
EmployeeHeader
EmployeeTabs
EmployeeMeta
EmployeeActivity
```

Reuse it everywhere.

---

# 74. MANAGER TEAM RECIPE

Create:

```text
TeamDetail
TeamHeader
TeamTabs
TeamMembers
TeamActivity
```

Use for every team.

---

# 75. PEOPLE DESIGN LANGUAGE

All People screens must share:

```text
same row height
same avatar size
same heading
same tabs
same status
same filters
same search
same sidebar
same metadata alignment
```

This consistency is mandatory.

---

# 76. VISUAL DISCIPLINE

No:

```text
giant employee cards
gradient profile headers
rainbow department colors
huge avatar banners
decorative org-chart backgrounds
glowing attendance clocks
```

Instead:

```text
quiet
structured
compact
professional
```

---

# 77. D2 VALIDATION SCREENS

Before completing D2, validate these screens:

```text
1. Employee Directory
2. Employee Profile
3. Team Page
4. Department Page
5. Attendance
6. Leave
7. My Profile
8. Organization Chart
```

All must visibly belong to one product.

---

# 78. D2 IMPLEMENTATION ORDER

```text
1. People navigation
2. Directory
3. People search
4. People filters
5. Employee profile
6. Employee activity
7. Team page
8. Department page
9. Organization chart
10. My Profile
11. Attendance
12. Leave
13. Manager team experience
14. HR people experience
15. CEO people overview
16. Responsive/mobile
17. Permission states
18. Loading/empty/error
19. Performance QA
20. Accessibility QA
21. Security QA
22. Visual consistency review
23. D3 backlog
```

---

# 79. D2 DO NOT BUILD

Do not use D2 for:

```text
Advanced recruitment
Advanced performance management
Complex compensation
Advanced payroll UI
Advanced people analytics
Skills graph
Mentorship
Employee marketplace
AI agents
Workplace management
```

Those belong later.

---

# 80. D2 DELIVERABLES

At completion:

```text
01. People Workspace
02. Employee Directory
03. People Search
04. People Filters
05. People Saved Views
06. Employee Profile
07. Employee Activity
08. Team Workspace
09. Department Workspace
10. Organization Chart
11. My Profile
12. Attendance Workspace
13. Leave Workspace
14. Manager People Experience
15. HR People Experience
16. Executive People Overview
17. Mobile People Experience
18. People Permission UX
19. People Loading/Empty/Error system
20. People Performance Baseline
21. People Security Tests
22. D3 Backlog
```

---

# 81. D2 DEFINITION OF DONE

D2 is complete only when:

```text
People navigation uses the D1 shell.

Directory uses the D1 list/table system.

Employee profiles use the D1 detail system.

Teams and departments use the same detail grammar.

Attendance uses the same table/state system.

Leave uses the same form/request grammar.

Organization chart uses Wamiro visual language.

All permissions remain enforced.

All tenant boundaries remain enforced.

Mobile is intentionally designed.

Light and dark mode work.

Large datasets are usable.

Empty/loading/error states are consistent.

The UI looks like one product across every People screen.
```

---

# 82. AGENT EXECUTION RULE

Do not merely create mockups.

Implement D2 in the actual Wamiro repository.

For each workspace:

```text
Inspect current MVP
↓
Reuse D1 components
↓
Build / refactor
↓
Run application
↓
Test real workflow
↓
Test permissions
↓
Test tenant isolation
↓
Test mobile
↓
Test light/dark
↓
Test accessibility
↓
Test performance
↓
Polish
↓
Document
```

Do not break existing employee/attendance/leave functionality.

Do not change source-of-truth behavior merely for visual reasons.

---

# 83. FINAL D2 PRINCIPLE

> **D2 turns Wamiro's People experience into one coherent workspace, not a collection of HR pages.**

The final user should be able to move naturally:

```text
Search Rahul
↓
Open Rahul's profile
↓
See his team
↓
Open team
↓
See team workload
↓
Open attendance
↓
Open leave
↓
Approve request
```

without feeling that any of these are separate applications.

---

# 84. FINAL D2 TARGET

The People experience should communicate:

> **“Everyone in the organization is connected here.”**

And the interface should remain:

```text
Quiet
Dense
Clear
Fast
Accessible
Permission-aware
Tenant-aware
Consistent
Mature
```

---

# WAMIRO

> **One workplace. One operating system for your organization.**
