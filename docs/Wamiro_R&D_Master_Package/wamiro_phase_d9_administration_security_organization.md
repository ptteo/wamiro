# WAMIRO — PHASE D9
## Administration, Security, Organization Management & Enterprise Control Plane
### Frappe-Style Operational UI + Workspace Rail Architecture + Exact Approved Palette

**Program:** Wamiro MNC-Grade UI/UX Transformation  
**Phase:** D9 — Administration + Security + Organization Management  
**Prerequisite:** D1–D8 completed  
**Primary goal:** Build the enterprise control plane for Wamiro: organization configuration, users, roles, permissions, security, integrations, system administration and governance — all using the same Wamiro/Frappe-inspired application language.

---

# 1. D9 MISSION

D9 is the administrative operating system of Wamiro.

It must allow authorized administrators to manage:

```text
Organization
Users
Employees
Teams
Departments
Roles
Permissions
Access
Security
Sessions
Devices
Authentication
SSO
MFA
Integrations
Modules
Feature Flags
Workflows
Notifications
Audit
Data Retention
System Configuration
```

The key principle:

> **Administration should feel powerful without feeling complicated.**

---

# 2. D9 WORKSPACE ARCHITECTURE

Administration is a major Rail workspace.

When the user selects:

```text
Administration
```

the contextual Sidebar must change to only Administration features allowed for the current user.

Suggested structure:

```text
Administration

Overview

Organization
  Company
  Departments
  Teams
  Locations
  Business Units

People & Access
  Users
  Roles
  Permissions
  Access Requests
  Sessions
  Devices

Security
  Authentication
  MFA
  SSO
  Security Policies
  Security Events

Platform
  Modules
  Feature Flags
  Custom Fields
  Workflows
  Notifications
  Integrations

Governance
  Audit Logs
  Data Retention
  Export / Backup
```

Do not place all of these directly into the Rail.

---

# 3. ADMIN SIDEBAR MUST BE CONTEXTUAL

Do not show:

```text
People
Work
Projects
Documents
Tasks
Tickets
```

as ordinary navigation items inside Administration.

Instead, Administration should control those domains through configuration only where the user's authority permits it.

---

# 4. ADMIN HOME

The Admin Home should answer:

> **Is the organization configured correctly, secure, and healthy?**

Structure:

```text
Overview
↓
Attention required
↓
Security
↓
Access
↓
Configuration
↓
Integrations
↓
Recent administrative activity
```

Do not turn Admin Home into a giant dashboard.

Prefer:

```text
queues
lists
compact summaries
status rows
```

---

# 5. ADMIN ATTENTION CENTER

Show only meaningful issues.

Examples:

```text
3 users awaiting approval
2 integrations failing
4 MFA exceptions
1 security policy changed
6 pending access requests
```

Each item should link directly to the relevant administration screen.

Avoid generic warning-card grids.

---

# 6. APPROVED PALETTE

The entire D9 application UI must use only:

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

No additional Wamiro application theme colors.

No gradients.

No neon.

No purple administrative UI.

No separate "security blue" palette.

Provider logos and customer-uploaded media may retain their native colors but must not change the Wamiro UI theme.

---

# 7. SEMANTIC TOKEN ARCHITECTURE

Use:

```text
text-ink-*
bg-surface-*
border-outline-*
```

through Wamiro semantic tokens.

Do not scatter:

```text
#hex
text-gray-900
bg-white
border-gray-200
```

through components.

The design token layer must remain the source of truth.

---

# 8. LIGHT MODE

Use the approved palette with the same visual hierarchy established in D1–D8.

Administration should not have a special theme.

---

# 9. DARK MODE

Use the same semantic token system.

Primary dark surfaces:

```text
#171717
#242424
#383838
```

Foreground hierarchy:

```text
#F8F8F8
#AFAFAF
#999999
```

Approved accents:

```text
#C23838
#BD660E
```

No special blue/purple security mode.

---

# 10. FONT

Use:

```text
InterVar
```

Only.

Do not introduce a different typography system for Admin/Security.

---

# 11. TYPOGRAPHY

Use the established Frappe-inspired typography rules:

```text
tight text
→ headings, buttons, labels, table cells, metadata

paragraph text
→ descriptions, helper text, explanations
```

Use sentence case.

Never use:

```text
uppercase navigation
tracking-wider headings
```

---

# 12. ADMIN PAGE HEADER

Use the existing Wamiro/Frappe-style header:

```text
Page title
Optional context
Primary action
Secondary actions
```

One primary action only.

Examples:

```text
Users                  [Invite user]

Roles                  [Create role]

Integrations            [Add integration]
```

---

# 13. ORGANIZATION MANAGEMENT

Organization configuration should cover:

```text
Company
Business units
Departments
Teams
Locations
Work schedules
Holidays
Organizational hierarchy
```

Use the D2 People architecture where possible.

---

# 14. COMPANY SETTINGS

Organization profile:

```text
Company name
Logo
Legal information where supported
Timezone
Locale
Default settings
```

Use D1 Settings architecture.

---

# 15. DEPARTMENTS

Department management should reuse D2:

```text
Department
Head
Teams
Members
Status
```

Do not create a separate visual model.

---

# 16. TEAMS

Teams reuse D2:

```text
Team
Manager
Members
Department
Status
```

---

# 17. LOCATIONS

Location table:

```text
Location
Country/region
Timezone
Employees
Status
```

Use compact table architecture.

---

# 18. ORGANIZATIONAL HIERARCHY

Admin can configure:

```text
Company
↓
Business Unit
↓
Department
↓
Team
↓
Employee
```

Reuse the D2 Organization Chart where appropriate.

---

# 19. USER MANAGEMENT

Users and employees are related but must remain conceptually distinct.

```text
User
=
identity / authentication / access

Employee
=
organization / employment / work information
```

Do not collapse these concepts.

---

# 20. USER LIST

Default table:

```text
User
Email
Status
Roles
Department
Last active
MFA
```

Optional:

```text
Created
Last login
Sessions
```

---

# 21. USER DETAIL

Use D1 Detail + Meta:

```text
Header
Identity
Roles
Access
Authentication
Sessions
Activity
```

Metadata:

```text
Status
Created
Last login
MFA
SSO
```

---

# 22. INVITE USER

Simple form:

```text
Email
Employee / existing employee
Role
Department/team where applicable
Message optional
```

Primary action:

```text
Invite
```

Do not add unnecessary fields.

---

# 23. USER LIFECYCLE

Support:

```text
Invited
Active
Suspended
Deactivated
Pending deletion where supported
```

Transitions must be audited.

---

# 24. OFFBOARDING

Use a controlled administrative workflow:

```text
Deactivate access
↓
Revoke sessions
↓
Revoke devices
↓
Reassign owned resources
↓
Handle documents
↓
Handle approvals
↓
Audit
```

Do not silently delete company data because a user is deactivated.

---

# 25. ROLE MANAGEMENT

Roles are reusable permission bundles.

Example:

```text
Employee
Manager
HR
IT Agent
Finance
Executive
Admin
```

These are examples, not fixed system roles.

---

# 26. ROLE LIST

Columns:

```text
Role
Users
Scope
Type
Updated
```

Optional:

```text
System/custom
```

Keep role management compact.

---

# 27. ROLE DETAIL

Structure:

```text
Role
Description
Permissions
Users
Scope
Audit
```

---

# 28. PERMISSION MODEL

Use the established RBAC/permission architecture.

Support where already designed:

```text
Role
Permission
Resource
Action
Scope
Condition
```

Do not create a second authorization engine.

---

# 29. PERMISSION MATRIX

Provide an administrative matrix:

```text
                    View    Create   Edit   Delete
Employees            ✓        ✓       ✓       —
Requests             ✓        ✓       ✓       —
Reports              ✓        —       —       —
```

Use compact tables.

Do not create giant permission cards.

---

# 30. EFFECTIVE ACCESS

One of the most important Admin screens:

```text
Who can access this?
```

For a user:

```text
User
↓
Direct roles
↓
Inherited roles
↓
Team/department scope
↓
Conditions
↓
Effective permissions
```

Show the final result clearly.

---

# 31. PERMISSION EXPLANATION

If access exists because of inheritance, show:

```text
Granted through:
Manager role
```

or:

```text
Granted through:
Engineering department policy
```

This improves administrator trust.

---

# 32. ACCESS REQUESTS

Reuse D4.

Admin should be able to:

```text
Review
Approve
Reject
Delegate
Audit
```

No duplicate approval workflow.

---

# 33. TEMPORARY ACCESS

Where already supported:

```text
User
Resource
Permission
Start
Expiry
Reason
```

Show:

```text
Expires in 3 days
```

Temporary access must expire automatically.

---

# 34. ACCESS REVIEW

Where the feature exists, provide:

```text
Users needing review
Expired access
Unused privileged access
Temporary access nearing expiry
```

Use actionable lists.

---

# 35. SECURITY CENTER

Security workspace inside Admin:

```text
Authentication
MFA
SSO
Sessions
Devices
Security Policies
Security Events
```

---

# 36. AUTHENTICATION SETTINGS

Where supported:

```text
Password policy
Session timeout
Login protection
Authentication methods
```

Keep each setting as a structured settings row.

---

# 37. MFA

Show:

```text
MFA status
Enrollment
Recovery options
Exceptions where authorized
```

Use subtle status indicators.

Do not create bright security dashboards.

---

# 38. SSO

SSO configuration:

```text
Provider
Status
Domain
Metadata/configuration
Last validation
```

Use a normal form/detail model.

---

# 39. SSO DOMAIN VERIFICATION

Show:

```text
Domain
Verification status
Verification method
Last checked
```

Actions:

```text
Verify
Retry
```

---

# 40. SESSIONS

Session table:

```text
Device
Location
Last active
Created
Status
```

User/admin action:

```text
Revoke
```

High-impact global revocation requires confirmation.

---

# 41. DEVICE SESSIONS

Reuse D2/D6 device architecture.

Do not build a separate device identity model.

---

# 42. SECURITY EVENTS

Security event list:

```text
Event
Actor
Resource
Time
Result
IP/device where appropriate
```

Examples:

```text
Login
MFA change
Password change
Role change
Permission change
Session revoked
SSO configuration changed
```

---

# 43. SECURITY EVENT DETAIL

Use D1 Detail + Meta:

```text
Event
Actor
Target
Time
Result
Context
```

Do not expose secrets.

---

# 44. AUDIT LOGS

The central audit system must support:

```text
Search
Filter
Date range
Actor
Resource
Action
Result
Export where authorized
```

---

# 45. AUDIT ROW

Compact:

```text
Rahul Sharma
Updated role
Admin
24 Aug · 14:32
Success
```

Use fixed metadata alignment.

---

# 46. AUDIT DETAIL

Show:

```text
What changed
Who changed it
When
Where
Previous value where appropriate
New value where appropriate
```

Sensitive fields should be redacted.

---

# 47. AUDIT PRIVACY

Do not expose:

```text
passwords
tokens
API secrets
raw credentials
private AI prompts unless policy explicitly permits retention
```

---

# 48. INTEGRATION CENTER

Admin integration workspace:

```text
Integrations
Connected
Available
Failed
Configuration
Logs
```

Examples:

```text
Frappe HR
Zammad
GLPI
Storage
Email
Google Workspace
Microsoft 365
SSO
```

These names should appear only if actually supported.

---

# 49. INTEGRATION LIST

Columns:

```text
Integration
Category
Status
Last sync
Environment
Updated
```

---

# 50. INTEGRATION DETAIL

```text
Integration
Status
Configuration
Health
Events
Logs
Permissions
```

Secrets must be masked.

---

# 51. INTEGRATION HEALTH

Example:

```text
Connected
Last sync 4 min ago
```

or:

```text
Connection failed

Last successful sync:
24 Aug · 11:08
```

Use human language.

---

# 52. MODULE MANAGEMENT

Wamiro should have a module-management model.

Modules may include:

```text
People
Work
Requests
Knowledge
Documents
Support
Finance
Analytics
AI
```

An organization may enable/disable modules where product architecture permits.

---

# 53. FEATURE FLAGS

Use a controlled feature-flag system:

```text
Feature
Status
Environment
Tenant
Rollout
```

Do not expose technical feature flags to normal employees.

---

# 54. MODULE → RAIL INTEGRATION

This connects directly to the D5 architecture:

```text
Enabled module
↓
Available workspace
↓
Rail item
↓
Contextual sidebar
```

Disabled module:

```text
No workspace in rail
No workspace sidebar
No accessible routes
```

Backend remains authoritative.

---

# 55. CUSTOM FIELDS

Where Wamiro already supports them, provide:

```text
Entity
Field
Type
Label
Required
Visibility
Default
Validation
```

Use the existing form architecture.

---

# 56. CUSTOM MODULES

Do not let custom modules break the navigation model.

A custom module must still provide:

```text
Rail/workspace decision
Sidebar definition
Routes
Permissions
Navigation
Search scope
```

If it is not a major mental model, it belongs inside an existing workspace.

---

# 57. WORKFLOW CONFIGURATION

Reuse D4.

Admin can:

```text
View workflows
Edit
Publish
Archive
Review executions
```

Do not duplicate the Workflow Builder.

---

# 58. NOTIFICATION CONFIGURATION

Reuse the central notification architecture.

Configure:

```text
Event
Channel
Audience
Template
Enabled
```

Channels depend on existing Wamiro support.

---

# 59. ORGANIZATION SETTINGS

Use settings groups:

```text
Organization
People
Work
Requests
Knowledge
Documents
Support
Analytics
AI
Security
Integrations
```

But do not repeat every feature as a settings page.

Only expose actual configuration options.

---

# 60. SETTINGS UI

Follow the established Frappe-inspired pattern:

```text
Settings navigation
+
Settings content
+
Section
+
Description
+
Rows
```

Avoid deeply nested cards.

---

# 61. ADMIN FORMS

Use:

```text
one column
space-y-4
labels
descriptions
errors
```

For advanced configuration:

```text
section
↓
subsection
↓
fields
```

Do not create giant forms.

---

# 62. CONFIRMATION UX

For destructive operations:

```text
Delete role
Deactivate user
Revoke access
Remove integration
Disable module
Delete custom field
```

Use the shared Wamiro confirmation dialog.

Explain consequences.

---

# 63. ADMIN EMPTY STATES

Users:

```text
No users yet.

Invite a user to get started.

[Invite user]
```

Integrations:

```text
No integrations connected.
```

Audit:

```text
No events match these filters.

[Clear filters]
```

---

# 64. ADMIN LOADING STATES

Keep shell visible.

Use:

```text
table skeleton
settings skeleton
detail skeleton
```

Do not blank the whole Admin area.

---

# 65. ADMIN ERROR STATES

Example:

```text
We couldn't load organization settings.

[Retry]
```

Keep error messages human-readable.

---

# 66. ADMIN DEGRADED STATES

Example:

```text
The HR integration is unavailable.

Organization settings remain available.

[Retry]
```

Do not crash the entire Admin workspace because one integration is down.

---

# 67. D9 MOBILE

Administration is primarily desktop-oriented but must remain usable on mobile.

Mobile architecture:

```text
Workspace selector
↓
Admin navigation sheet
↓
Page
```

For tables:

```text
primary identity
+
secondary metadata
+
detail route
```

---

# 68. MOBILE SECURITY ACTIONS

High-risk actions on mobile require:

```text
clear consequence
confirmation
```

Do not expose dangerous destructive actions through accidental taps.

---

# 69. D9 ACCESSIBILITY

Support:

```text
keyboard navigation
focus-visible
screen readers
semantic tables
accessible dialogs
accessible forms
accessible status
reduced motion
```

Permission matrices must remain understandable with assistive technology.

---

# 70. D9 PERFORMANCE

Administration can contain large enterprise datasets.

Design for:

```text
100 users
10,000 users
100,000 users
large audit logs
large permission sets
large integration histories
```

Use:

```text
server-side search
pagination
indexed queries
virtualization
lazy loading
```

---

# 71. D9 SECURITY

This phase is security-critical.

Test:

```text
Non-admin cannot access Admin routes
Non-admin cannot discover Admin data through search
Admin permissions are scoped correctly
Tenant A cannot see Tenant B organization settings
Tenant A cannot see Tenant B audit logs
Tenant A cannot see Tenant B integrations
Role changes take effect correctly
Revoked sessions become invalid
Expired temporary permissions disappear
Disabled modules cannot be accessed directly
```

---

# 72. PRIVILEGED ACTION PROTECTION

Sensitive actions may require:

```text
confirmation
re-authentication where configured
reason
audit
```

Examples:

```text
Deactivate admin
Revoke all sessions
Disable SSO
Delete integration
Delete organization data
```

Do not implement re-authentication logic inside individual pages; use a shared security mechanism.

---

# 73. D9 AUDIT EVENTS

Examples:

```text
user.invited
user.activated
user.suspended
user.deactivated

role.created
role.updated
role.deleted

permission.granted
permission.revoked
access.delegated
access.expired

mfa.updated
sso.updated
session.revoked

integration.created
integration.updated
integration.disabled

module.enabled
module.disabled

feature_flag.updated

organization.updated
department.updated
team.updated
location.updated
```

---

# 74. D9 EVENTS

Administrative events should feed:

```text
Audit
Notifications
Security
Analytics
Automation
```

Do not tightly couple these systems to Admin UI components.

---

# 75. D9 PALETTE COMPLIANCE

Scan all D9 application UI styles for:

```text
#hex
rgb(
rgba(
hsl(
hsla(
named colors
```

Every Wamiro application color must resolve to:

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
provider logos
customer-uploaded media
document content
```

must not modify Wamiro's theme.

---

# 76. NO GRADIENT ADMIN UI

Never build:

```text
gradient security dashboard
neon permission matrix
purple admin console
glowing security alerts
huge configuration cards
```

Administration should be:

```text
precise
quiet
dense
structured
```

---

# 77. ADMIN DESIGN ANTI-PATTERN

Do not make:

```text
card
card
card
card
```

for every setting.

Prefer:

```text
section
description
rows
divider
control
```

This is especially important for large settings areas.

---

# 78. EFFECTIVE PERMISSION UX

One of D9's most valuable screens:

```text
User:
Rahul Sharma

Effective access:

People
  View ✓
  Edit ✓

Requests
  View ✓
  Approve ✓

Finance
  View —
```

Allow administrators to understand *why* access exists.

---

# 79. ROLE SIMULATION / ACCESS PREVIEW

Where supported, provide:

```text
View as user
```

or:

```text
Preview effective access
```

The preview must not grant access or bypass the real security model.

It simply explains what that user would see.

---

# 80. SECURITY POSTURE

Admin may have a summary:

```text
MFA coverage
SSO status
Active sessions
Recent security events
Pending privileged access
```

Use compact rows, not giant security score cards.

---

# 81. ORGANIZATION HEALTH

Admin overview may summarize:

```text
Users
Active modules
Integration health
Security configuration
Pending requests
Recent admin activity
```

Only existing/real data.

Do not invent a "company health score."

---

# 82. D9 VALIDATION SCREENS

Validate:

```text
1. Admin Home
2. User List
3. User Detail
4. Invite User
5. Role List
6. Role Detail
7. Permission Matrix
8. Effective Access
9. Access Review
10. Security Center
11. MFA Settings
12. SSO Settings
13. Sessions
14. Security Events
15. Audit Logs
16. Integration List
17. Integration Detail
18. Module Management
19. Feature Flags
20. Organization Settings
21. Department / Team Admin
22. Mobile Admin
```

---

# 83. D9 IMPLEMENTATION ORDER

```text
1. Administration Rail workspace
2. Admin contextual sidebar
3. Admin Home
4. User List
5. User Detail
6. Invite User
7. User lifecycle
8. Role List
9. Role Detail
10. Permission Matrix
11. Effective Access
12. Access Review
13. Temporary Access
14. Security Center
15. Authentication Settings
16. MFA
17. SSO
18. Sessions
19. Security Events
20. Audit Logs
21. Integration Center
22. Integration Detail
23. Module Management
24. Feature Flags
25. Organization Management
26. Department/Team configuration
27. Custom Fields where already supported
28. Workflow configuration
29. Notification configuration
30. Security-critical confirmations
31. Mobile Admin
32. Accessibility
33. Security testing
34. Performance
35. Exact palette verification
36. Light/dark visual QA
37. Final D9 visual review
38. D10 backlog
```

---

# 84. D9 DELIVERABLES

```text
01. Administration Workspace
02. Admin Contextual Sidebar
03. Admin Home
04. User Management
05. User Detail
06. User Invitation
07. User Lifecycle
08. Role Management
09. Permission Matrix
10. Effective Access
11. Access Review
12. Temporary Access
13. Security Center
14. Authentication Settings
15. MFA
16. SSO
17. Session Management
18. Security Events
19. Audit Logs
20. Integration Center
21. Integration Detail
22. Module Management
23. Feature Flags
24. Organization Management
25. Department / Team Administration
26. Existing Custom Fields Configuration
27. Existing Workflow Configuration
28. Existing Notification Configuration
29. Security-critical confirmation flows
30. Mobile Admin
31. Permission UX
32. Audit
33. Accessibility Verification
34. Security Verification
35. Performance Verification
36. Exact Palette Verification
37. Light Mode Verification
38. Dark Mode Verification
39. D10 Backlog
```

---

# 85. D9 DEFINITION OF DONE

D9 is complete only when:

```text
Administration is a major Wamiro Rail workspace.

The Admin sidebar is contextual.

Users and employees remain conceptually distinct.

Roles remain reusable permission bundles.

There is one authorization engine.

Effective access is explainable.

Temporary access expires.

MFA/SSO/session management are centralized.

Security events are auditable.

Audit logs are searchable and permission-controlled.

Integrations use provider abstraction.

Modules control workspace availability.

Disabled modules cannot be accessed directly.

Organization configuration reuses D2 concepts.

Workflow settings reuse D4.

Knowledge/document settings reuse D5.

Support settings reuse D6.

Analytics settings reuse D7.

AI settings reuse D8.

Tenant isolation is verified.

Privileged actions are protected.

Mobile is usable.

Accessibility is verified.

Light mode uses only the approved palette.

Dark mode uses only the approved palette.

No gradients exist.

No unrelated application colors exist.

No duplicate design systems exist.

Every D9 screen uses the same Wamiro/Frappe-inspired workspace grammar.
```

---

# 86. AGENT EXECUTION RULE

The current Wamiro system is already working.

Do not rewrite business logic just for visual changes.

Before implementation:

```text
Inspect
↓
Understand existing authorization
↓
Understand existing tenant model
↓
Understand existing organization model
↓
Understand existing integrations
↓
Reuse D1–D8 components
```

Then:

```text
Implement
↓
Run
↓
Test authorization
↓
Test tenant isolation
↓
Test privileged actions
↓
Test session revocation
↓
Test module access
↓
Test light mode
↓
Test dark mode
↓
Check exact palette
↓
Accessibility
↓
Performance
↓
Visual comparison
↓
Polish
↓
Document
```

Never claim a security control is complete without a real test.

---

# 87. FINAL D9 PRINCIPLE

> **Administration is the control plane, not another dashboard.**

The administrator should be able to understand:

```text
Who exists?
Who can access what?
Why can they access it?
What is secure?
What changed?
What integrations are healthy?
What modules are enabled?
What requires attention?
```

without navigating through dozens of disconnected systems.

---

# 88. FINAL D9 TARGET

The completed Administration experience should feel:

```text
Precise
Quiet
Dense
Controlled
Transparent
Secure
Auditable
Scalable
Enterprise-grade
```

It should look and behave like a natural Wamiro workspace rather than a separate administration product.

---

# WAMIRO

> **One workplace. One operating system for your organization.**
