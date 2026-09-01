# WAMIRO — PHASE D13
## People & HR Lifecycle, Recruitment, Performance, Learning & Employee Experience
### Native Wamiro Workspace + Frappe-Style Enterprise UI + Exact Approved Palette

**Program:** Wamiro MNC-Grade Portal Transformation  
**Phase:** D13 — Advanced People / HR Lifecycle / Employee Experience  
**Prerequisite:** D1–D12 completed  
**Primary goal:** Complete the People/HR layer so Wamiro can support the full employee lifecycle without becoming a collection of disconnected HR products.

---

# 1. D13 MISSION

Expand the People workspace from:

```text
Directory
+
Organization
+
Attendance
+
Leave
```

into:

```text
Recruit
↓
Hire
↓
Onboard
↓
Work
↓
Develop
↓
Perform
↓
Recognize
↓
Transfer / Promote
↓
Offboard
```

Everything remains inside the Wamiro operating system.

---

# 2. ABSOLUTE RULE

Do not create a separate HR application.

Reuse:

```text
People
Work
Requests
Knowledge
Documents
Analytics
AI
Administration
```

Do not create duplicate:

```text
approval engine
document system
task system
notification system
search system
permission system
workflow engine
audit system
```

---

# 3. PEOPLE WORKSPACE ARCHITECTURE

People remains a major Rail workspace.

Contextual Sidebar may contain, according to permissions and enabled modules:

```text
People

Directory
Teams
Departments
Organization
Attendance
Leave
Recruitment
Onboarding
Performance
Goals
Learning
Recognition
Surveys
Employee Lifecycle
Reports
```

Employees, managers and HR must see appropriate subsets.

---

# 4. EMPLOYEE VS USER

Keep:

```text
User
= authentication / identity / access

Employee
= employment / organization / people data
```

Do not collapse these domain models.

---

# 5. EMPLOYEE PROFILE

Primary structure:

```text
Header
↓
Profile summary
↓
Employment
↓
Organization
↓
Work
↓
Attendance / Leave
↓
Goals / Performance
↓
Documents
↓
Assets
↓
Activity
```

Every section remains permission-aware.

---

# 6. PROFILE HEADER

Example:

```text
Rahul Sharma
Senior Software Engineer

Engineering
Platform Team

[More]
```

Identity first; metadata remains quiet.

---

# 7. EMPLOYEE SELF-SERVICE

Where allowed, employee may update:

```text
Photo
Phone
Emergency contact
Address
Skills
Preferences
```

Sensitive HR fields require the existing controlled request/approval model.

---

# 8. HR DATA CHANGE REQUEST

Reuse D4:

```text
Employee
↓
Change request
↓
Approval
↓
Update
↓
Audit
```

No separate HR approval system.

---

# 9. RECRUITMENT

Recruitment becomes a People sub-workspace:

```text
Recruitment
  Candidates
  Jobs
  Interviews
  Pipeline
  Offers where supported
```

Only implement actual approved product scope.

---

# 10. RECRUITMENT PIPELINE

Use a restrained Board/List pattern:

```text
Applied
Screening
Interview
Offer
Hired
Rejected
```

No colorful recruitment Kanban.

---

# 11. CANDIDATE LIST

Columns:

```text
Candidate
Role
Stage
Owner
Applied
Updated
```

Optional:

```text
Location
Source
```

---

# 12. CANDIDATE DETAIL

```text
Header
Candidate information
Application
Interview
Documents
Activity
Notes
```

Recruiting information is permission-controlled.

---

# 13. JOBS

Job list:

```text
Job
Department
Hiring manager
Status
Openings
Updated
```

Job detail:

```text
Job
Description
Requirements
Department
Hiring manager
Candidates
Approvals where used
Activity
```

---

# 14. INTERVIEWS

Interview:

```text
Candidate
Interviewers
Schedule
Type
Status
Feedback
```

Interview feedback:

```text
Interviewer
Score where supported
Comments
Recommendation
Submitted
```

Private interviewer notes stay restricted.

---

# 15. OFFERS

Where supported:

```text
Candidate
↓
Offer
↓
Approval
↓
Sent
↓
Accepted / Rejected
```

Reuse D4 approvals.

---

# 16. ONBOARDING

Connect:

```text
Employee
↓
Onboarding plan
↓
Tasks
↓
Documents
↓
Training
↓
Access
↓
Completion
```

---

# 17. ONBOARDING HOME

Employee:

```text
Welcome
Onboarding progress
Tasks
Documents
Training
People to meet
```

Manager/HR:

```text
New joiners
Progress
Blocked tasks
Outstanding documents
```

---

# 18. ONBOARDING TASKS

Reuse D3 Work.

Examples:

```text
Complete profile
Upload documents
Meet manager
Complete security training
Set up device
Read employee handbook
```

No second task engine.

---

# 19. ONBOARDING DOCUMENTS

Reuse D5 Documents:

```text
Offer
Policy acknowledgment
Identity documents
Employee handbook
```

Permissions remain strict.

---

# 20. ONBOARDING KNOWLEDGE

Reuse D5:

```text
Getting started
Company policies
Team handbook
Technical setup
HR FAQ
```

---

# 21. ONBOARDING ACCESS

Reuse D4 + D9:

```text
Access request
↓
Approval
↓
Provisioning
```

---

# 22. OFFBOARDING

Lifecycle:

```text
Resignation / termination
↓
Process
↓
Tasks
↓
Asset return
↓
Access revocation
↓
Document handling
↓
Completion
↓
Audit
```

---

# 23. OFFBOARDING TASKS

Reuse D3:

```text
Return hardware
Complete handover
Close work
Transfer ownership
Exit interview
```

---

# 24. OFFBOARDING ASSETS

Reuse D6:

```text
Assigned assets
↓
Return
↓
Inspection
↓
Status update
```

---

# 25. OFFBOARDING ACCESS

Reuse D9:

```text
Deactivate user
↓
Revoke sessions
↓
Revoke devices
↓
Revoke access
```

No separate security engine.

---

# 26. PERFORMANCE MANAGEMENT

People features:

```text
Performance
  My Reviews
  Team Reviews
  Review Cycles
  Feedback
  History
```

Permission-aware.

---

# 27. REVIEW CYCLES

Where supported:

```text
Cycle
Period
Participants
Status
Deadline
```

---

# 28. PERFORMANCE REVIEW

```text
Employee
Period
Goals
Achievements
Feedback
Manager review
Employee self-review
Final outcome
```

Do not turn performance into a decorative scorecard.

---

# 29. SELF REVIEW

Employee may provide:

```text
Achievements
Challenges
Goals
Development areas
```

---

# 30. MANAGER REVIEW

Manager may review:

```text
Goals
Progress
Achievements
Feedback
Development
```

---

# 31. GOALS / OKRs

Reuse D3 Work + D7 Analytics.

```text
Goal
Owner
Period
Progress
Key results
Status
```

Goal detail:

```text
Goal
↓
Key results
↓
Tasks/projects
↓
Progress
↓
Comments
↓
Activity
```

Do not copy data into a second goal system.

---

# 32. LEARNING & DEVELOPMENT

People workspace:

```text
Learning
  My Learning
  Courses
  Required Training
  Progress
  Certificates
```

Implement only approved learning scope.

---

# 33. COURSE LIST / DETAIL

List:

```text
Course
Category
Required
Progress
Updated
```

Detail:

```text
Course
Description
Lessons
Required
Progress
Certificate
```

---

# 34. TRAINING ASSIGNMENT

HR/manager may assign:

```text
Course
Employee/team
Due date
Required
```

---

# 35. TRAINING PROGRESS

Employee:

```text
Completed
In progress
Upcoming
Overdue
```

Manager/HR:

```text
Team completion
Overdue
Required training
```

---

# 36. RECOGNITION

Where supported:

```text
Recognition
Employee
Reason
Date
```

Keep it restrained; do not turn Wamiro into a social network.

Visibility may be:

```text
Private
Team
Department
Company
```

according to organization policy.

---

# 37. SURVEYS

Where supported:

```text
Survey
Audience
Questions
Status
Responses
```

Reuse shared Forms/Request architecture.

---

# 38. PULSE SURVEYS

Keep simple:

```text
Question
Answer
Submit
```

Do not create a visually heavy survey application.

---

# 39. EMPLOYEE ENGAGEMENT

Where existing data supports it, surface:

```text
Participation
Survey response
Recognition
Learning
```

Do not invent an unsupported "employee happiness score."

---

# 40. HR ANALYTICS

Reuse D7.

Possible existing metrics:

```text
Headcount
Joiners
Leavers
Attendance
Leave
Training
Performance cycles
Recruitment
```

Only authorized HR analytics should be visible.

---

# 41. EMPLOYEE LIFECYCLE TIMELINE

Profile can show:

```text
Joined
Promoted
Transferred
Leave events
Performance cycles
Training
Recognition
Offboarded
```

Use the common timeline.

---

# 42. EMPLOYEE DOCUMENTS / ASSETS / WORK

Reuse existing systems:

```text
Documents → D5
Assets → D6
Tasks / Projects / Goals → D3
Requests → D4
Knowledge → D5
```

No duplicate records.

---

# 43. HR APPROVALS

Use D4 Approval Center.

Examples:

```text
Leave
Employee changes
Recruitment
Onboarding
Offboarding
Performance
```

No second approval engine.

---

# 44. HR SEARCH

Global search may expose authorized:

```text
Employee
Candidate
Job
Course
Review
Goal
```

Use the shared search system.

---

# 45. HR COMMAND PALETTE

Where supported:

```text
Find employee
Add employee
Create job
Create candidate
Start review
Assign training
Open onboarding
```

Only expose actual operations.

---

# 46. HR NOTIFICATIONS

Central notifications:

```text
Interview scheduled
Onboarding task
Training due
Review due
Leave update
Profile change request
Recognition
```

No HR-only notification center.

---

# 47. FORMS / TABLES / PROFILES

Use the established Wamiro/Frappe-style patterns:

```text
Forms
→ label + description + control + error

Tables
→ compact rows + stable columns

Profiles
→ quiet identity + sectioned data + metadata + timeline
```

Do not use social-profile UI.

---

# 48. D13 EXACT PALETTE

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

No separate HR color system.

---

# 49. TYPOGRAPHY

Use:

```text
InterVar
```

Same Frappe-inspired:

```text
tight UI type
paragraph type
sentence case
compact metadata
```

---

# 50. DARK / LIGHT MODE

Verify:

```text
employee profiles
recruitment
onboarding
performance
learning
forms
tables
documents
dialogs
```

in both themes.

No separate HR dark theme.

---

# 51. MOBILE

Employee:

```text
Profile
Leave
Work
Goals
Learning
Requests
```

Manager:

```text
Team
Reviews
Approvals
```

HR:

```text
Candidates
Employees
Lifecycle
Reviews
Learning
```

Use the D10 mobile architecture.

---

# 52. MOBILE PROFILE

Prioritize:

```text
Identity
Status
Manager
Primary actions
Critical information
```

Secondary content may collapse.

---

# 53. MOBILE ONBOARDING

Prioritize:

```text
Progress
Next task
Required documents
Training
```

Do not use large dashboard cards.

---

# 54. MOBILE PERFORMANCE REVIEW

Show:

```text
Review status
Goals
Feedback
Action
```

---

# 55. ACCESSIBILITY

Verify:

```text
keyboard
screen reader
forms
tables
dialogs
status
timeline
charts where present
```

Sensitive HR information cannot rely on color alone.

---

# 56. HR SECURITY

Test:

```text
Employee sees only authorized profile information
Manager sees authorized team data
HR sees authorized HR data
Executive does not automatically see sensitive HR data
Recruitment data is restricted
Performance reviews are private where required
Compensation data is restricted
Employee documents are protected
Tenant A cannot access Tenant B HR data
AI cannot retrieve unauthorized HR data
```

---

# 57. SENSITIVE HR DATA

Treat as restricted where applicable:

```text
compensation
personal contact
identity documents
performance reviews
candidate information
interview feedback
```

Use strict permissions and audit.

---

# 58. D13 AUDIT

Audit important lifecycle actions:

```text
employee.created
employee.updated
employee.manager_changed
employee.department_changed

candidate.created
candidate.updated
candidate.stage_changed
candidate.hired
candidate.rejected

onboarding.started
onboarding.completed

offboarding.started
offboarding.completed

review.created
review.submitted
review.completed

training.assigned
training.completed

recognition.created
survey.created
survey.submitted
```

---

# 59. D13 PERFORMANCE

Design for:

```text
1,000 employees
10,000 employees
100,000+ employees
large candidate pools
large learning catalogs
large review histories
```

Use:

```text
server-side filtering
pagination
indexed queries
virtualization
lazy loading
```

---

# 60. PROVIDER ABSTRACTION

If an external HR provider exists:

```text
PeopleService
HRService
RecruitmentService
LearningService
```

with adapters where required.

Frontend remains Wamiro-native.

---

# 61. D13 DEPENDENCIES

People/HR connects to:

```text
Work
Requests
Documents
Knowledge
Support
Analytics
AI
Administration
```

Reuse existing domain models.

---

# 62. CONTEXTUAL SEARCH

People search may include:

```text
Employees
Teams
Departments
Candidates
Jobs
Courses
Reviews
Goals
```

Global search may include them when supported.

---

# 63. CONTEXTUAL COMMANDS

Only existing operations:

```text
Find employee
Create employee
Create job
Create candidate
Start review
Assign course
Open onboarding
```

---

# 64. VISUAL ANTI-PATTERNS

Never create:

```text
giant employee profile cards
social-media HR feed
rainbow performance dashboards
purple HR panels
gradient onboarding screens
decorative candidate cards
large motivational illustrations everywhere
```

Prefer:

```text
lists
tables
sections
timelines
quiet surfaces
```

---

# 65. VALIDATION SCREENS

Validate:

```text
1. People Home
2. Employee Directory
3. Employee Profile
4. Recruitment List
5. Candidate Detail
6. Job List
7. Job Detail
8. Interview
9. Onboarding
10. Offboarding
11. Performance Review
12. Goal Detail
13. Learning
14. Course Detail
15. Recognition
16. Survey
17. HR Analytics
18. Mobile Employee Profile
19. Mobile Onboarding
20. Mobile Performance
```

---

# 66. IMPLEMENTATION ORDER

```text
1. People Rail workspace audit
2. HR contextual Sidebar
3. Employee profile expansion
4. Recruitment
5. Candidates
6. Jobs
7. Interviews
8. Offers where already supported
9. Onboarding
10. Onboarding task integration
11. Onboarding document integration
12. Onboarding knowledge integration
13. Onboarding access integration
14. Offboarding
15. Asset return integration
16. Access revocation integration
17. Performance reviews
18. Review cycles
19. Goals integration
20. Learning
21. Training assignment
22. Recognition
23. Surveys
24. HR Analytics integration
25. Search
26. Command palette
27. Notifications
28. Mobile People/HR
29. Security
30. Audit
31. Accessibility
32. Performance
33. Exact palette verification
34. Light/dark QA
35. Visual QA
36. D14 backlog
```

---

# 67. DELIVERABLES

```text
01. People/HR Workspace
02. HR Contextual Sidebar
03. Employee Profile
04. Recruitment
05. Candidates
06. Jobs
07. Interviews
08. Offers where already supported
09. Onboarding
10. Onboarding Tasks
11. Onboarding Documents
12. Onboarding Knowledge
13. Onboarding Access
14. Offboarding
15. Asset Return Integration
16. Access Revocation Integration
17. Performance Reviews
18. Review Cycles
19. Goals Integration
20. Learning
21. Training Assignment
22. Recognition
23. Surveys
24. HR Analytics Integration
25. HR Search
26. HR Commands
27. HR Notifications
28. Mobile People/HR
29. Permission UX
30. Security Verification
31. Audit
32. Accessibility Verification
33. Performance Verification
34. Exact Palette Verification
35. Light Mode Verification
36. Dark Mode Verification
37. D14 Backlog
```

---

# 68. DEFINITION OF DONE

D13 is complete only when:

```text
People remains one major Wamiro workspace.

Recruitment is integrated into People.

Onboarding uses Work, Documents, Knowledge, Requests and Admin.

Offboarding uses Work, Assets and Administration.

Performance uses Goals/Work where applicable.

Learning uses Knowledge where appropriate.

Employee documents use D5.

Employee assets use D6.

Approvals use D4.

Analytics use D7.

AI respects HR permissions.

Search is centralized.

Notifications are centralized.

Tenant isolation is verified.

Sensitive HR information is protected.

Compensation/performance/candidate data follows strict permissions.

Mobile works.

Light mode uses only the approved palette.

Dark mode uses only the approved palette.

No gradients exist.

No unrelated application colors exist.

No duplicate HR engines are created.

The entire experience looks like native Wamiro.
```

---

# 69. AGENT EXECUTION RULE

Before implementation:

```text
Inspect D2 People
↓
Inspect D3 Work
↓
Inspect D4 Requests
↓
Inspect D5 Documents/Knowledge
↓
Inspect D6 Assets
↓
Inspect D7 Analytics
↓
Inspect D8 AI
↓
Inspect D9 Administration
```

Then:

```text
Implement
↓
Run
↓
Test HR permissions
↓
Test sensitive data access
↓
Test tenant isolation
↓
Test lifecycle workflows
↓
Test document permissions
↓
Test asset handoff
↓
Test access revocation
↓
Test mobile
↓
Test light/dark
↓
Check palette
↓
Accessibility
↓
Performance
↓
Audit
↓
Visual comparison
↓
Polish
↓
Document
```

Do not replace working systems merely because another HR product implements them differently.

---

# 70. FINAL D13 PRINCIPLE

> **Every employee should experience their entire lifecycle inside one connected Wamiro workspace.**

Ideal flow:

```text
Candidate
↓
Employee
↓
Onboarding
↓
Work
↓
Goals
↓
Performance
↓
Learning
↓
Recognition
↓
Promotion / transfer
↓
Offboarding
```

---

# 71. FINAL D13 TARGET

The People/HR experience should feel:

```text
Human
Structured
Private
Clear
Connected
Fast
Permission-aware
Auditable
Enterprise-grade
```

not like a separate HR application bolted onto Wamiro.

---

# WAMIRO

> **One workplace. One operating system for your organization.**
