# COMPANY OS — FINAL END-TO-END PRODUCT + ENGINEERING BLUEPRINT
## World-Class Internal Company Portal
### Free / Open-Source-First, Production-Ready, Secure, Scalable, Permission-Aware

**Document purpose:** This is the definitive blueprint for transforming the existing internal portal into a world-class Company Operating System (Company OS).

**Primary objective:** Build one beautiful, fast, secure, extensible portal for employees, managers, HR, IT, finance, executives, and administrators while avoiding unnecessary custom development by integrating mature free/open-source systems.

**Current-date baseline:** 23 August 2026

---

# 1. EXECUTIVE VISION


# 1A. COMMERCIAL PRODUCT ARCHITECTURE — PLATFORM BRAND + CUSTOMER BRAND

The product must be designed as a **standalone multi-tenant SaaS platform**, not as software permanently branded for Howdy Analytics.

The Company OS should have its own independent product brand.

Example:

```text
PLATFORM
Nexora

Customer / Tenant
Howdy Analytics
```

Howdy Analytics becomes the **first customer / tenant**, not the identity of the platform.

The architecture must support many unrelated organizations using the same product.

```text
                         PRODUCT PLATFORM
                              |
                         Nexora Platform
                              |
           +------------------+------------------+
           |                  |                  |
      Organization A      Organization B     Organization C
      Howdy Analytics      Acme Corp          XYZ Ltd
           |                  |                  |
        Workspace          Workspace          Workspace
```

## Customer-facing principle

Inside a tenant workspace, the customer's identity should be primary.

For example, when Howdy Analytics registers:

```text
Company Name:
Howdy Analytics

Logo:
Howdy Analytics Logo

Workspace:
howdy.nexora.app
```

Employees should primarily see:

```text
Howdy Analytics
Home
My Work
People
Projects
Knowledge
Requests
Analytics
AI
```

They should not constantly see the platform provider's brand.

The platform brand remains visible where appropriate in:

- marketing
- platform-level administration
- documentation
- support
- developer portal
- billing/subscription areas if commercial billing is later introduced
- legal pages
- platform-managed emails where required

## White-label / tenant branding

Each organization should be able to configure:

```text
Company Name
Logo
Favicon
Primary Color
Secondary Color
Light Theme
Dark Theme
Login Branding
Email Branding
Company Website
Support Contact
Timezone
Locale
Currency
Date Format
Language
```

Future enterprise customers may also configure:

```text
Custom Domain
Custom Login Domain
Custom Email Domain
```

Example:

```text
howdy.nexora.app
acme.nexora.app
portal.customer.com
```

## Tenant resolution

Every incoming request should resolve:

```text
domain / subdomain
      ↓
tenant
      ↓
tenant configuration
      ↓
branding
      ↓
identity
      ↓
permissions
      ↓
data
```

Never rely on the frontend to determine tenant context.

Tenant context must be established and validated server-side.

## Core tenant entity

The core platform should have an organization/tenant model similar to:

```text
organizations

id
name
slug
status
logo_url
favicon_url
primary_color
secondary_color
theme_config
custom_domain
timezone
locale
currency
date_format
language
support_contact
website_url
created_at
updated_at
```

All tenant-owned business data must be tenant-scoped.

Examples:

```text
organization_id
```

on:

```text
users
employees
departments
teams
roles
permissions
requests
approvals
workflows
documents
notifications
projects
analytics
integrations
audit_logs
```

## Strict tenant isolation

Tenant A must never be able to access:

- Tenant B users
- Tenant B employees
- Tenant B documents
- Tenant B workflows
- Tenant B analytics
- Tenant B AI data
- Tenant B search results
- Tenant B notifications
- Tenant B integrations

This must be enforced at the backend/data layer.

Do not rely only on:

```text
WHERE organization_id = ...
```

added manually in random queries.

Create centralized tenant-scoping mechanisms and authorization guards.

## Tenant-aware AI

AI must always receive tenant context.

```text
User
 ↓
Tenant
 ↓
Permissions
 ↓
AI
 ↓
Tenant-specific data only
```

The AI system must never retrieve data across tenants.

## Tenant-aware search

Meilisearch documents must include tenant isolation metadata.

Search requests must be tenant-scoped before results are returned.

## Tenant-aware object storage

Documents/files should be organized or logically isolated by tenant.

Example:

```text
tenant/{organization_id}/documents/...
tenant/{organization_id}/assets/...
tenant/{organization_id}/exports/...
```

## Tenant-aware audit

Every important audit event must contain:

```text
organization_id
actor_user_id
action
resource
resource_id
timestamp
```

## Tenant configuration

Organizations should be able to configure:

```text
Enabled Modules
Custom Roles
Custom Permissions
Custom Fields
Custom Workflows
Notification Preferences
Branding
Integrations
Policies
Dashboard Layout
AI Features
Feature Flags
```

## Module enable/disable

A tenant should not be forced to use every module.

Example:

```text
Organization A
✓ HR
✓ Projects
✓ Knowledge
✓ IT
✓ AI
✗ Finance

Organization B
✓ HR
✓ Finance
✓ Projects
✗ IT
```

Navigation and APIs must respect tenant module configuration.

## Organization Setup Wizard

Registration should launch an onboarding wizard:

```text
1. Company name
2. Company logo
3. Industry
4. Country
5. Timezone
6. Organization structure
7. Initial Super Admin
8. Invite employees
9. Select modules
10. Configure roles
11. Configure branding
12. Configure integrations
13. Finish setup
```

The system should automatically create:

```text
Organization
Default Super Admin
Default Roles
Default Permissions
Default Workflows
Default Settings
Default Dashboard
Branding Configuration
```

## Customer workspace

Each tenant should have a workspace identity:

```text
Tenant
 ↓
Workspace
 ↓
Users
 ↓
Company OS
```

The workspace should dynamically apply:

- tenant name
- logo
- favicon
- colors
- theme
- modules
- navigation
- roles
- permissions
- integrations

## Platform vs tenant administration

Create two distinct concepts:

### Platform Administration

Managed by the SaaS provider.

Controls:
- all tenants
- platform infrastructure
- global configuration
- platform health
- product releases
- global feature flags
- commercial/billing infrastructure later

### Tenant Administration

Managed by each customer's authorized administrators.

Controls:
- their users
- their organization
- their roles
- their permissions
- their workflows
- their integrations
- their branding
- their modules
- their policies

The platform provider must not casually expose tenant business data to platform operators.

Use explicit break-glass/support access for exceptional support cases.

## Future SaaS commercialization readiness

Even if billing is not implemented initially, keep the architecture capable of supporting later:

```text
subscription
plan
enabled_features
usage
limits
billing_status
trial_status
```

Do not make billing a dependency of the internal deployment.

The product should work fully in a self-hosted/internal configuration without a paid SaaS service.

## Future multi-region / enterprise readiness

Keep the tenant model compatible with:
- regional data residency
- tenant-specific encryption strategies
- enterprise SSO
- custom domains
- tenant-specific retention policies
- tenant-specific compliance settings
- tenant-specific integrations

Do not implement these prematurely, but do not hard-code the system around a single-company assumption.

---


The product should not be treated as:

> "an HR portal with some extra features."

It should become:

> **The company's single digital workplace and internal operating system.**

The user should experience:

- One login
- One home
- One navigation
- One global search
- One employee directory
- One employee profile
- One notification center
- One task center
- One request center
- One approval center
- One knowledge system
- One document experience
- One workflow system
- One AI assistant
- One management/CEO dashboard
- One admin console

The user should **never feel the underlying systems**.

For example:

Bad:
> Open Frappe HR.

Good:
> My Attendance

Bad:
> Open OpenProject.

Good:
> My Tasks

Bad:
> Open Zammad.

Good:
> My Support Requests

The Company OS is the experience layer.

Specialized systems are domain engines.

---

# 2. PRODUCT PRINCIPLES

## 2.1 User First

Every feature must solve a real user problem.

## 2.2 Simplicity

Complex backend systems should feel simple at the UI level.

## 2.3 Speed

The portal should feel instant.

## 2.4 Security

Users must only see and perform what they are authorized to access.

## 2.5 Reliability

Critical workflows must be dependable.

## 2.6 Data Integrity

Never sacrifice correctness for development speed.

## 2.7 Scalability

The architecture must support more users, data, departments, integrations, workflows, and modules without a rewrite.

## 2.8 Consistency

Everything must look and behave like one product.

## 2.9 Open Source

Use free/open-source/self-hosted components wherever possible.

## 2.10 Replaceability

Specialized external systems should be replaceable without rebuilding the Company OS UI.

## 2.11 AI With Guardrails

AI should create leverage, not become a security bypass.

## 2.12 Progressive Complexity

The backend may be sophisticated; the user experience should remain simple.

---

# 3. CORE EXPERIENCE

```text
                           COMPANY OS

        ┌──────────────────┼──────────────────┐
        │                  │                  │
     EMPLOYEE            MANAGER            CEO
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                    UNIFIED PORTAL
                           │
 ┌─────────┬─────────┬────┼─────┬──────────┬──────────┐
 │         │         │          │          │          │
People    Work   Knowledge   Requests  Analytics     AI
 │         │         │          │          │          │
HR       Tasks      Docs      Approvals   KPIs      Assistant
Leave    Projects   Policies  Workflows   Reports   Search
Attend.  Goals      Wiki      Automation  Insights  Actions
```

---

# 4. ROLE MODEL

This portal must support strict access boundaries.

The core role set should be:

```text
SUPER ADMIN
CEO / EXECUTIVE
HR ADMIN
DEPARTMENT ADMIN
MANAGER
EMPLOYEE
CUSTOM ROLE
```

Do not build the authorization system as only:

```text
employee
manager
ceo
admin
```

That is not granular enough.

The correct model is:

```text
ROLE
+
PERMISSION
+
SCOPE
+
OPTIONAL CONDITION
+
OPTIONAL EXPIRATION
```

---

# 5. SUPER ADMIN

Create a dedicated **Super Admin** capability.

Super Admin has platform authority over:

- Users
- Organizations
- Departments
- Teams
- Roles
- Permissions
- Feature flags
- Integrations
- Workflows
- System configuration
- Security configuration
- Audit logs
- System health
- All Company OS modules

Super Admin must have:

- MFA
- privileged-action auditing
- session/device management
- optional step-up authentication
- recovery procedure
- optional IP/network restrictions

Do not implement:

```text
isAdmin = true
```

as the primary authorization model.

Use an explicit privileged role and permission set.

---

# 6. CEO ACCESS

CEO should have broad **business authority**, not necessarily unrestricted **platform authority**.

Typical CEO access:

- Company-wide business dashboards
- Workforce overview
- Department analytics
- Strategic goals
- Company projects
- Company trends
- Approved financial analytics
- Company documents according to permission
- Decision center
- Executive reports
- Company-wide workflows

Not automatically:

- passwords
- secret keys
- infrastructure secrets
- token material
- unrestricted security credentials
- data explicitly restricted by policy

CEO can be granted additional permissions through the permission system.

---

# 7. HR ADMIN

Typical HR access:

- Employee records
- Employee lifecycle
- Attendance
- Leave
- Payroll
- Performance
- HR documents
- HR policies
- onboarding/offboarding
- HR analytics
- HR requests
- HR workflows

Sensitive fields should still be explicitly permission-controlled.

---

# 8. DEPARTMENT ADMIN

Department Admin sees only the assigned department by default.

Can manage:

- department employees
- department workflows
- department requests
- department analytics
- department announcements
- department-specific settings

---

# 9. MANAGER

Manager scope is normally **TEAM**.

Can access:

- direct/assigned team members
- team attendance
- team leave
- team workload
- team tasks
- team projects
- team performance
- team analytics
- team approvals
- team announcements
- 1:1 information

Managers must not automatically see all company data.

---

# 10. EMPLOYEE

Default Employee scope is **SELF**.

Can access:

- own profile
- own attendance
- own leave
- own documents
- own tasks
- own projects where assigned
- own approvals
- own notifications
- authorized company knowledge
- approved company announcements
- own requests
- own support tickets
- permitted team information

---

# 11. CUSTOM ROLES

The platform must support custom roles.

Examples:

- Finance Manager
- Recruitment Lead
- IT Administrator
- Compliance Officer
- Operations Head
- Regional Manager
- Project Director
- Security Analyst

Custom roles should require no code changes.

---

# 12. PERMISSION MODEL

Use granular permissions.

Examples:

```text
employees.view
employees.create
employees.edit
employees.delete
employees.view_salary
employees.view_performance
employees.view_documents

attendance.view_self
attendance.view_team
attendance.view_department
attendance.view_company
attendance.manage

leave.apply
leave.view_self
leave.view_team
leave.view_department
leave.approve
leave.manage

projects.view
projects.create
projects.edit
projects.delete
projects.manage

analytics.view_team
analytics.view_department
analytics.view_company

documents.view
documents.upload
documents.edit
documents.delete
documents.approve

users.manage
roles.manage
permissions.manage
integrations.manage
workflows.manage
audit.view
system.settings.manage
```

---

# 13. PERMISSION SCOPE

Every applicable permission should support:

```text
SELF
TEAM
DEPARTMENT
COMPANY
GLOBAL
```

Example:

```text
Manager
attendance.view_team
scope = TEAM

HR
attendance.view_company
scope = COMPANY

Employee
attendance.view_self
scope = SELF
```

---

# 14. ABAC SUPPORT

Use RBAC + contextual authorization.

Examples:

```text
manager AND same_team
```

or:

```text
hr_admin AND employee.department = authorized_department
```

or:

```text
permission exists
AND resource belongs to user's organization
```

Long-term, support attributes such as:

- department
- team
- location
- employment status
- legal entity
- project
- region
- sensitivity class

---

# 15. PERMISSION PRECEDENCE

Define a deterministic policy.

Recommended:

```text
Explicit Deny
    >
Explicit User Permission
    >
Role Permission
    >
Group/Team Permission
    >
Default
```

Document the final rule and enforce it consistently.

---

# 16. PERMISSION MANAGEMENT CENTER

Authorized Super Admins and explicitly authorized CEOs/Admins need a permission-management interface.

Navigation:

```text
Administration
  └── Access Control
      ├── Users
      ├── Roles
      ├── Permissions
      ├── Role Assignment
      ├── Permission Overrides
      ├── Access Requests
      └── Audit History
```

---

# 17. PERMISSION UI/UX

Permission management must be powerful but simple.

Example:

```text
ACCESS CONTROL

Search employee / team / department

[ Rahul Sharma ]

Role
[ Manager ▼ ]

People
────────────────────────
View team members          ✓
Edit team members          ✓
View salary                ✕
View performance           ✓

Attendance
────────────────────────
Self                        ✓
Team                        ✓
Department                  ✕
Company                     ✕

Projects
────────────────────────
View                        ✓
Create                      ✓
Manage                      ✓

Analytics
────────────────────────
Team                        ✓
Department                  ✓
Company                     ✕

[ Edit Permissions ]
```

Use:
- grouped permissions
- inheritance indicators
- scope controls
- search
- diff view
- audit history
- temporary access
- clear explanations

---

# 18. TEMPORARY ACCESS

Support:

```text
Permission:
analytics.view_department

Scope:
Engineering

Start:
2026-08-23

Expires:
2026-09-23

Reason:
Quarterly audit
```

Automatically revoke at expiry.

Create an audit event.

---

# 19. ACCESS REQUESTS

Employees should be able to request additional access.

```text
Employee
   ↓
Request Access
   ↓
Choose resource
   ↓
Reason
   ↓
Manager approval
   ↓
Admin/HR approval if required
   ↓
Grant
   ↓
Audit
```

Use the same workflow framework as other requests.

---

# 20. PERMISSION AUDIT

Every user should have an access summary.

Example:

```text
RAHUL SHARMA

Role:
Manager

Inherited:
Manager

Direct permissions:
analytics.view_department

Denied:
employees.view_salary

Temporary:
finance.reports.view
Expires: 30 Sep 2026

Last changed:
23 Aug 2026

Changed by:
Super Admin
```

History:

```text
23 Aug
Granted analytics.view_department
by Super Admin

10 Aug
Granted finance.reports.view
by CEO

01 Jul
Manager role assigned
```

---

# 21. NAVIGATION AUTHORIZATION

Navigation must be permission-aware.

Employee should not see:

- Admin
- Payroll Administration
- Security Management
- System Configuration

But remember:

> Hiding a menu item is UX, not security.

The API must always enforce authorization independently.

---

# 22. ARCHITECTURE

Use:

```text
                          USERS
                            |
         +------------------+------------------+
         |                  |                  |
     EMPLOYEE            MANAGER             CEO
         |                  |                  |
         +------------------+------------------+
                            |
                    COMPANY OS FRONTEND
                            |
                      Next.js + React
                            |
                    Unified Experience
                            |
                      NestJS API/BFF
                            |
      +---------------------+--------------------+
      |                     |                    |
 PostgreSQL            Redis/BullMQ         Meilisearch
      |
      +---------------------+--------------------+
                            |
                     Integration Layer
                            |
      +---------+----------+----------+----------+
      |         |                     |          |
   Keycloak   Frappe HR         OpenProject    GLPI
   Identity      HR                Work         ITSM
      |         |                     |          |
      +---------+----------+----------+----------+
                            |
              Documents / BI / Workflow / AI
                            |
       +---------+---------+---------+----------+
       |         |         |         |          |
     MinIO   Paperless  Metabase Temporal    Wiki
    Storage   Docs      BI       Workflow   Knowledge
                            |
                           AI
                            |
                   LangGraph + AI SDK
                            |
                         pgvector
```

---

# 23. TECHNOLOGY BASELINE

## Frontend

- Next.js 16.3
- React 19.2
- TypeScript
- Tailwind CSS
- shadcn/ui
- Radix UI
- Lucide
- TanStack Query
- TanStack Table
- Zustand
- React Hook Form
- Zod
- Tiptap
- cmdk
- FullCalendar
- dnd-kit
- React Flow
- Apache ECharts
- date-fns
- next-themes
- next-intl

## Backend

- NestJS
- TypeScript
- PostgreSQL
- Drizzle ORM
- Redis
- BullMQ
- Temporal
- Zod
- OpenTelemetry

## Infrastructure/services

- Keycloak
- Frappe HR
- OpenProject
- GLPI
- Zammad
- Paperless-ngx
- Meilisearch
- MinIO
- Metabase OSS
- Prometheus
- Grafana
- Loki
- Tempo

## AI

- Vercel AI SDK
- LangGraph
- PostgreSQL
- pgvector
- Zod

---

# 24. CURRENT VERSION POLICY

The stack must always use current stable versions at implementation time.

Verified baseline as of 23 August 2026:

- Next.js 16.3
- React 19.2
- Keycloak 26.7.1

The official Next.js site reports 16.3 as the current release line and announced a scheduled security release for 26 August 2026, so the agent must check the official Next.js security/release page immediately before production deployment rather than blindly pinning an old patch. 
Source: https://nextjs.org/blog

React's official docs list 19.2 as the latest version. 
Source: https://react.dev/versions

Keycloak official downloads/documentation list 26.7.1, and Keycloak 26.7 introduced capabilities including SCIM provisioning preview and additional security improvements. 
Source: https://www.keycloak.org/downloads

### Agent rule

Before installing/upgrading any dependency:

1. Search official project release information.
2. Confirm latest stable version.
3. Check security advisories.
4. Check license.
5. Check compatibility.
6. Pin exact production versions.

---

# 25. FREE / OPEN-SOURCE POLICY

The core architecture must not depend on paid features.

Preferred approach:

```text
SELF-HOST
+
FREE
+
OPEN SOURCE
+
API AVAILABLE
+
REPLACEABLE
```

Potential products may have different licenses.

The agent must record:

```text
dependency
version
license
repository
reason
integration style
commercial restrictions
```

Use separate-service/API integration when a copyleft product should not be embedded directly into proprietary code.

---

# 26. COMPLETE PRODUCT MODULES

## Core

- Dashboard/Home
- Global Search
- Command Palette
- Employee Directory
- Employee Profiles
- Organization Chart
- Departments
- Teams
- Company Calendar
- Notifications
- Activity Feed
- Favorites
- Recently Viewed

## Employee

- My Profile
- My Work
- Tasks
- Projects
- Goals & OKRs
- Personal Calendar
- Attendance
- Clock In/Out
- Leave
- Holidays
- Expenses
- Documents
- Payslips
- Compensation
- Benefits
- Assigned Assets
- Performance
- Training
- Onboarding
- Offboarding
- Requests
- Approvals
- Recognition

## HR

- Employee Management
- Recruitment
- Onboarding
- Offboarding
- Attendance
- Leave
- Payroll
- Benefits
- Performance
- Training
- Employee Documents
- Employee Lifecycle
- Workforce Planning
- Surveys
- HR Analytics
- Policies
- HR Helpdesk

## Manager

- Team Dashboard
- Team Members
- Team Attendance
- Team Leave
- Team Workload
- Team Tasks
- Team Projects
- Goals & OKRs
- Performance Reviews
- Approvals
- Team Analytics
- 1:1 Management
- Team Announcements

## Executive

- Executive Dashboard
- Company KPIs
- Workforce Overview
- Department Performance
- Business Metrics
- Financial Overview
- Operational Metrics
- Strategic Goals
- Risks & Alerts
- Trends
- Executive Reports
- Decision Center

## Work

- Tasks
- Projects
- Kanban
- Calendar
- Gantt
- Timeline
- Goals/OKRs
- Time Tracking
- Workload
- Meetings
- Productivity
- Saved Views
- Automation

## Communication

- Announcements
- Team Updates
- Department Updates
- Internal Feed
- Comments
- Mentions
- Reactions
- Discussions
- Polls
- Surveys
- Events
- Chat
- Notifications

## Knowledge

- Knowledge Base
- Wiki
- Policies
- Handbook
- SOPs
- FAQs
- Documentation
- Training
- Internal News
- Search
- AI Knowledge Assistant

## Documents

- Company Documents
- Employee Documents
- Shared Files
- Folders
- Search
- Version History
- Approval
- E-signatures
- Templates
- Access Control

## Workflow

- Requests
- Approvals
- Workflow Builder
- Custom Forms
- Custom Workflows
- Escalations
- Delegation
- Reminders
- Service Requests
- Tickets
- SLA
- Automation

## IT

- IT Helpdesk
- Hardware Assets
- Software Assets
- Access Requests
- Device Management
- Inventory
- IT Knowledge
- Incident Management
- Service Catalog

## Finance/Admin

- Expense Management
- Expense Approvals
- Purchase Requests
- Vendor Management
- Budget Requests
- Travel Requests
- Reimbursements
- Admin Requests

## Analytics

- Employee Analytics
- Attendance Analytics
- Leave Analytics
- Productivity Analytics
- Project Analytics
- Workflow Analytics
- Department Analytics
- HR Analytics
- Executive Analytics
- Custom Reports
- Custom Dashboards
- Data Export

## AI

- Company AI Assistant
- AI Search
- Knowledge Assistant
- Employee Assistant
- Meeting Summaries
- Report Summaries
- Analytics Insights
- Workflow Automation
- Recommendations
- Natural-language commands
- Agents
- Autonomous workflows

## Administration

- Admin Dashboard
- Users
- Roles
- Permissions
- RBAC
- Organizations
- Departments
- Configuration
- Custom Fields
- Custom Modules
- Feature Flags
- Workflow Configuration
- Notification Configuration
- Integration Management
- Access Requests
- Permission Audit

## Security

- SSO
- MFA
- Identity
- Access Control
- Audit Logs
- Security Logs
- Session Management
- Device Sessions
- Permission Auditing
- Data Retention
- Backup/Recovery
- Compliance

---

# 27. BUILD VS INTEGRATE

## Build yourself

- Home
- Navigation
- Unified Search UX
- Command Center
- Employee Directory
- Employee Profile
- Employee Workspace
- Manager Workspace
- Executive Workspace
- Admin Workspace
- Request Center
- Approval Center
- Notification experience
- Activity experience
- Company-specific workflows
- Organization model
- Fine-grained permission UX
- Integration layer
- AI layer
- Company-specific analytics
- Company-specific automation

## Integrate

- Authentication
- SSO
- MFA
- HR
- Payroll
- Attendance
- Leave
- Projects
- Gantt
- IT asset management
- Helpdesk
- OCR
- Document management
- BI
- Search engine
- Rich-text editor
- Calendar engine
- Workflow execution
- Background jobs
- Object storage
- E-signature
- Survey engine

---

# 28. HR

Use Frappe HR for:

- Employee management
- Employee lifecycle
- Attendance
- Clock in/out
- Leave
- Payroll
- Expenses
- Performance
- Onboarding
- Offboarding

The Company OS owns:
- navigation
- UX
- employee dashboard
- manager dashboard
- permissions
- notifications
- cross-system views

---

# 29. PROJECTS

Use OpenProject for:

- projects
- work packages
- tasks
- boards
- Gantt
- timelines
- project planning
- time tracking

Company OS aggregates:
- My Work
- Team Work
- Manager workload
- Executive project health

---

# 30. IT

Use GLPI for:
- assets
- hardware
- software
- inventory
- ITSM

Use Zammad for:
- tickets
- support
- helpdesk
- SLA workflows

---

# 31. DOCUMENTS

Use:
- MinIO
- Paperless-ngx
- Meilisearch
- Temporal

Company OS provides:
- unified document navigation
- permission layer
- previews
- contextual links
- approvals
- search
- AI

---

# 32. KNOWLEDGE

Use a self-hosted open-source wiki.

Potential options:
- Wiki.js
- BookStack

Before selecting the final product:
- verify current maintenance
- verify current license
- verify API/export
- verify full-text search
- verify permission model

---

# 33. ANALYTICS

Use:
- Metabase OSS
- ECharts
- PostgreSQL
- analytics database when needed

Executive dashboards should be custom UI instead of exposing raw BI tooling.

---

# 34. SEARCH

Use Meilisearch.

Searchable domains:

```text
employee
team
department
task
project
document
knowledge
policy
announcement
ticket
request
```

Search must be permission-aware.

---

# 35. NOTIFICATIONS

Central notification service.

Support:
- in-app
- email
- push/PWA where justified

Priority:
- critical
- high
- normal
- low

Modes:
- immediate
- digest
- muted

Every notification should link directly to the relevant object/action.

---

# 36. WORKFLOW

Use:

- Temporal for durable execution
- React Flow for visual workflow UX
- React Hook Form for forms
- Zod for validation
- BullMQ for normal jobs

Workflow:

```text
Request
 ↓
Validate
 ↓
Authorize
 ↓
Start Workflow
 ↓
Approval
 ↓
External Action
 ↓
Audit
 ↓
Notification
 ↓
Complete
```

---

# 37. COMPANY REQUEST CENTER

Unified request types:

- Leave
- Expense
- Purchase
- Travel
- IT access
- Equipment
- HR
- Admin
- Custom

Forms are schema-driven.

---

# 38. COMPANY APPROVAL CENTER

One page for:
- leave
- expense
- purchasing
- access
- documents
- HR
- administrative requests

Approval UI should optimize for:
- context
- clarity
- speed
- auditability

---

# 39. DOCUMENT PROCESSING PIPELINE

```text
Upload
 ↓
MinIO
 ↓
Queue
 ↓
Virus/security processing
 ↓
OCR
 ↓
Text extraction
 ↓
Metadata
 ↓
Embedding
 ↓
pgvector
 ↓
Meilisearch
```

---

# 40. AI PLATFORM

Use:

- Vercel AI SDK
- LangGraph
- Zod
- pgvector
- PostgreSQL

AI is not a standalone toy.

It should be integrated into:
- search
- dashboard
- tasks
- knowledge
- documents
- workflows
- analytics
- employee profile where authorized

---

# 41. AI TOOL ARCHITECTURE

Never:

```text
AI → arbitrary SQL
```

Use:

```text
AI
 ↓
Typed Tool
 ↓
Authorization
 ↓
Domain Service
 ↓
DB/API
```

Examples:

```text
get_my_tasks()
get_my_leave_balance()
get_my_approvals()
get_team_members()
get_department_metrics()
search_company_knowledge()
search_documents()
create_request()
```

---

# 42. AI ACTION LEVELS

## Read-only

- search
- summarize
- explain

## Recommendation

- prioritize
- recommend
- identify risks

## Execute

- create requests
- update tasks
- send messages
- execute workflows

Sensitive writes must require confirmation unless organizational policy explicitly permits automation.

---

# 43. AI PERMISSION MODEL

AI inherits the user's exact effective authorization.

```text
User
 ↓
Identity
 ↓
Effective Permissions
 ↓
AI Tool
 ↓
Domain Authorization
 ↓
Data
```

Never give the AI broader permissions than the user.

---

# 44. ORGANIZATIONAL KNOWLEDGE GRAPH

Long-term strategic capability:

```text
Employee
 |
 +-- Team
 +-- Manager
 +-- Department
 +-- Project
 +-- Task
 +-- Document
 +-- Policy
 +-- Meeting
 +-- Goal
 +-- Skill
 +-- Request
 +-- Knowledge
```

This powers:
- AI
- search
- recommendations
- analytics
- organizational insights
- automation

Do not build the graph first.

Build it incrementally from existing domain relationships.

---

# 45. DATABASE OWNERSHIP

Company OS owns:
- organizations
- teams
- portal users/preferences
- notifications
- requests
- approvals
- workflows
- audit
- Company-specific configuration
- permission overrides
- integrations

External systems own their specialist data.

---

# 46. MONOREPO

Recommended structure:

```text
company-os/
|
+-- apps/
|   +-- web/
|   +-- api/
|   +-- worker/
|
+-- packages/
|   +-- ui/
|   +-- db/
|   +-- auth/
|   +-- permissions/
|   +-- validation/
|   +-- events/
|   +-- integrations/
|   +-- search/
|   +-- notifications/
|   +-- workflows/
|   +-- ai/
|
+-- infrastructure/
|   +-- docker/
|   +-- monitoring/
|   +-- deployment/
|
+-- docs/
|   +-- architecture/
|   +-- security/
|   +-- product/
|   +-- api/
|   +-- operations/
|
+-- tooling/
```

Adapt to the actual existing repository instead of rewriting it unnecessarily.

---

# 47. DOMAIN STRUCTURE

Backend:

```text
auth/
users/
organizations/
departments/
teams/
employees/
attendance/
leave/
tasks/
projects/
goals/
calendar/
notifications/
announcements/
documents/
knowledge/
requests/
approvals/
workflows/
tickets/
assets/
analytics/
ai/
integrations/
audit/
admin/
health/
```

---

# 48. FRONTEND STRUCTURE

```text
apps/web/

app/
  (authenticated)/
  (admin)/

features/
  dashboard/
  people/
  work/
  requests/
  approvals/
  knowledge/
  documents/
  analytics/
  admin/

components/
hooks/
lib/
```

---

# 49. API

Use:

```text
/api/v1/
```

Examples:

```text
/api/v1/me
/api/v1/employees
/api/v1/teams
/api/v1/departments
/api/v1/tasks
/api/v1/projects
/api/v1/requests
/api/v1/approvals
/api/v1/notifications
/api/v1/search
/api/v1/documents
/api/v1/knowledge
/api/v1/analytics
/api/v1/ai
/api/v1/admin
```

Never expose provider-specific vendor APIs directly to the frontend.

---

# 50. OBSERVABILITY

Use OpenTelemetry.

Monitor:
- API
- frontend/server boundaries
- database
- Redis
- queues
- external APIs
- Temporal
- AI

Open-source monitoring stack:

```text
OpenTelemetry
Prometheus
Grafana
Loki
Tempo
```

---

# 51. ADMIN SYSTEM HEALTH

Admin should see:

```text
API
Database
Redis
Search
Workers
Temporal
Frappe HR
OpenProject
GLPI
Zammad
Document service
Storage
AI
```

Show:
- status
- latency
- error rate
- queue backlog
- last successful sync
- last failed sync

---

# 52. FAILURE ISOLATION

If:

```text
HR unavailable
```

then:

```text
Employee profile -> available
Projects -> available
Knowledge -> available
Search -> available
```

Only HR-dependent functionality should degrade.

Same principle for:
- OpenProject
- GLPI
- Zammad
- AI
- analytics

---

# 53. BACKGROUND PROCESSING

Use BullMQ for:
- email
- notifications
- indexing
- sync
- reports
- exports
- embeddings
- cleanup

Use Temporal for:
- approval workflows
- long-running business processes
- cross-system orchestration
- retryable durable processes

---

# 54. SECURITY ARCHITECTURE

Use defense in depth:

```text
Internet
 ↓
WAF / Reverse Proxy
 ↓
Web
 ↓
API
 ↓
AuthN
 ↓
AuthZ
 ↓
Domain Service
 ↓
Database / External System
```

Security requirements:
- HTTPS
- secure cookies
- MFA
- authorization
- input validation
- rate limits
- secure headers
- CSRF protection where applicable
- dependency security scanning
- secret scanning
- container scanning
- audit logs
- encrypted backups
- least privilege

---

# 55. FILE SECURITY

Check permissions:
1. before generating file links
2. in the API
3. at storage access where possible

Do not rely on a hidden UI button.

---

# 56. AUDIT SYSTEM

Every privileged/sensitive action must record:

```text
actor_user_id
action
entity_type
entity_id
timestamp
organization_id
ip_address
user_agent
old_value
new_value
metadata
request_id
```

Examples:

```text
ROLE_CREATED
ROLE_ASSIGNED
PERMISSION_GRANTED
PERMISSION_REVOKED
LEAVE_APPROVED
EMPLOYEE_UPDATED
PAYROLL_VIEWED
DOCUMENT_DOWNLOADED
WORKFLOW_APPROVED
INTEGRATION_CHANGED
```

---

# 57. SESSION MANAGEMENT

Users should be able to view:
- active sessions
- devices
- last active
- approximate location where policy allows
- session creation
- revoke session

Admins should have privileged session visibility according to policy.

Super Admins should require strong authentication.

---

# 58. ACCESS REVIEW

Add periodic access review.

Example:

```text
Quarterly Access Review

Manager permissions
HR permissions
Temporary permissions
Sensitive data access
Inactive accounts
Unused privileges
```

Admins can:
- approve
- revoke
- renew
- investigate

This is a high-value enterprise feature.

---

# 59. INACTIVE ACCOUNT HANDLING

Define policy for:
- terminated users
- suspended users
- employees on leave
- contractors
- temporary staff

Never automatically delete data merely because an account is disabled.

Use lifecycle states.

---

# 60. EMPLOYEE LIFECYCLE

Support:

```text
Invited
 ↓
Onboarding
 ↓
Active
 ↓
Leave/Suspended
 ↓
Offboarding
 ↓
Inactive
```

Connect lifecycle transitions to workflows.

---

# 61. ONBOARDING AUTOMATION

New employee:

```text
Employee Created
 ↓
Create portal account
 ↓
Assign department/team
 ↓
Create onboarding checklist
 ↓
IT request
 ↓
Asset assignment
 ↓
Training
 ↓
Policies
 ↓
Manager tasks
 ↓
Welcome notification
```

Use Temporal.

---

# 62. OFFBOARDING AUTOMATION

```text
Offboarding Approved
 ↓
Restrict account
 ↓
Notify stakeholders
 ↓
Asset recovery
 ↓
Document checks
 ↓
Access review
 ↓
Revoke external access
 ↓
Archive data
 ↓
Audit
```

Never immediately delete important data.

---

# 63. MOBILE

Responsive web first.

Prioritize:
- clock in/out
- leave
- approvals
- notifications
- announcements
- directory
- requests

A PWA can later be introduced.

---

# 64. UI/UX QUALITY BAR

Every page must have:

- clear hierarchy
- obvious primary action
- consistent spacing
- predictable navigation
- excellent loading states
- useful empty states
- clear error states
- responsive behavior
- keyboard support
- permission-aware actions

Use subtle motion only where it improves comprehension.

---

# 65. DESIGN SYSTEM RULES

Use a coherent system for:
- colors
- typography
- spacing
- elevation
- radius
- density
- focus
- interactions
- status indicators

Do not let individual developers invent component styles page-by-page.

---

# 66. COMMAND CENTER

Use cmdk.

Keyboard shortcut:

```text
Ctrl/Cmd + K
```

Actions:
- navigate
- search
- create
- approve
- open
- invoke AI
- quick settings

---

# 67. SEARCH UX

Search should support:
- instant suggestions
- categories
- recent searches
- filters
- keyboard navigation
- permissions
- ranking

Potential future search:

```text
"people in engineering who know TypeScript"
```

This should eventually use structured organizational data + semantic search.

---

# 68. ANALYTICS MODEL

Do not define metrics directly inside UI components.

Create a metric layer:

```text
Metric
- id
- name
- definition
- formula
- source
- owner
- refresh_rate
- sensitivity
```

Examples:
- headcount
- attendance
- leave utilization
- approval latency
- project completion
- workflow SLA
- departmental performance

This prevents conflicting numbers across dashboards.

---

# 69. EXECUTIVE ANALYTICS

The executive experience should answer:

- What is happening?
- What changed?
- Why?
- What requires attention?
- What risks exist?
- What decision is needed?

Do not just show charts.

Use:
- trend indicators
- anomaly detection
- drilldowns
- context
- summaries
- action links

---

# 70. MANAGER ANALYTICS

Manager dashboard should answer:

- Who needs attention?
- What work is late?
- Who is overloaded?
- Which approvals are waiting?
- What is the team's workload?
- What changed this week?

---

# 71. EMPLOYEE PRODUCTIVITY

Employee dashboard should answer:

- What do I need to do?
- What is due?
- What needs my approval?
- What changed?
- Where do I find information?
- What is next?

---

# 72. PRODUCT ANALYTICS

Track portal usage, not invasive employee surveillance.

Useful:
- active users
- feature adoption
- search success
- task completion
- request completion
- approval latency
- error rate
- workflow reliability

Avoid:
- hidden surveillance
- unjustified behavior scoring
- opaque employee ranking

---

# 73. PERFORMANCE ENGINEERING

Use:
- server rendering
- streaming
- caching
- partial prefetching
- optimistic updates
- pagination
- virtualization
- lazy loading
- efficient SQL
- background jobs

Next.js 16.3 includes Instant Navigations and Partial Prefetching intended to make app-like navigation more responsive. Use these features where appropriate after verifying the exact version/security state in production. citeturn274522search1

React 19.2 adds Activity and partial pre-rendering capabilities that can be useful for responsive application experiences. citeturn274522search0

---

# 74. DATABASE PERFORMANCE

For large queries:
- inspect query plans
- add appropriate indexes
- avoid N+1
- select only required columns
- paginate
- use cursor pagination where appropriate
- cache stable reference data

Never fetch entire organization datasets just to render a small table.

---

# 75. CACHING

Good candidates:
- organization settings
- feature flags
- permission metadata
- reference data
- frequently-read dashboards
- search suggestions

Bad candidates without careful invalidation:
- rapidly changing payroll
- security state
- sensitive authorization facts

Cache authorization carefully.

---

# 76. EVENT ARCHITECTURE

Use internal domain events:

```text
employee.created
employee.updated
leave.requested
leave.approved
leave.rejected

task.created
task.completed

request.created
request.approved
request.rejected

document.uploaded
document.approved

announcement.published

workflow.started
workflow.completed
```

Consumers:
- notification
- audit
- search
- analytics
- AI indexing
- integrations

---

# 77. SYNC ARCHITECTURE

Use:
- webhooks when available
- scheduled reconciliation
- on-demand fetch

Every external entity mapping should contain:
- external ID
- last sync
- sync status
- last error

Build reconciliation jobs.

---

# 78. MULTI-ORGANIZATION READINESS

Even if currently one organization, keep organization boundaries.

Use:
```text
organization_id
```

where appropriate.

This supports future:
- subsidiaries
- legal entities
- branches
- business units

---

# 79. FEATURE FLAGS

Use an open standard such as OpenFeature-compatible tooling.

Flag examples:

```text
ai_assistant
new_search
workflow_builder
new_dashboard
knowledge_graph
mobile_features
```

Support gradual rollout:
- internal developers
- beta users
- teams
- departments
- percentage rollout

---

# 80. NO PREMATURE MICROSERVICES

Start with:

```text
modular monolith
+
specialized open-source services
```

Only split Company OS domains into independently deployed services when there is actual need.

Do not build:
- 20 microservices
- service mesh
- Kafka
- Kubernetes

unless scale or reliability requirements justify them.

---

# 81. NO PREMATURE KUBERNETES

Start with containerized deployment.

Move to Kubernetes only when there is a real need for:
- multi-node scaling
- high availability
- workload isolation
- sophisticated orchestration

---

# 82. CI/CD

Pipeline:

```text
Pull Request
 ↓
Lint
 ↓
Typecheck
 ↓
Unit Tests
 ↓
Integration Tests
 ↓
Security Scans
 ↓
Build
 ↓
Migration Checks
 ↓
Preview
 ↓
Staging
 ↓
Smoke Tests
 ↓
Production
```

---

# 83. DATABASE MIGRATION

Use:

```text
Expand
 ↓
Compatible release
 ↓
Backfill
 ↓
Switch
 ↓
Contract
```

Never delete schema/data casually.

---

# 84. BACKUPS

PostgreSQL:
- full backups
- WAL/PITR where appropriate
- offsite copy
- encryption
- restore testing

Object storage:
- versioning
- backup
- replication where appropriate
- restore testing

---

# 85. DATA MIGRATION FROM EXISTING PORTAL

Before changing major functionality:

```text
Current Portal
 ↓
Backup
 ↓
Data Audit
 ↓
Mapping
 ↓
Migration
 ↓
Validation
 ↓
Dual Read where useful
 ↓
Cutover
 ↓
Monitoring
```

Validate:
- users
- employee mappings
- teams
- attendance
- leave
- requests
- approvals
- documents
- permissions

---

# 86. TESTING

## Unit
- business rules
- authorization
- validation
- calculations

## Integration
- DB
- external adapters
- search
- Redis
- queues
- workflows

## E2E
- login
- profile
- attendance
- leave
- request
- approval
- documents
- notifications
- admin

## Security
- IDOR
- privilege escalation
- unauthorized object access
- document leakage
- search leakage
- AI permission bypass

---

# 87. DEFINITION OF DONE

Feature is not complete merely because it renders.

It is complete only when:

```text
UI
+
API
+
Authorization
+
Validation
+
Database
+
Migration
+
Loading State
+
Error State
+
Empty State
+
Accessibility
+
Responsive Design
+
Tests
+
Observability
+
Security
+
Documentation
```

are addressed.

---

# 88. DEVELOPMENT PHASES

## Phase 0 — Audit

Deliver:
- current architecture
- data model
- feature map
- permission map
- integration map
- security risks
- performance risks
- migration strategy

---

## Phase 1 — Foundation

Build:
- repo conventions
- design system
- Keycloak
- RBAC/ABAC foundation
- PostgreSQL
- Drizzle
- Redis
- API foundation
- audit
- observability
- CI/CD
- error handling

---

## Phase 2 — Company OS Shell

Build:
- Home
- Navigation
- Search
- Command Palette
- Directory
- Profile
- Teams
- Departments
- Notifications
- Activity
- Settings

---

## Phase 3 — Authorization Center

Build:
- users
- roles
- permissions
- scopes
- permission editor
- temporary access
- access request workflow
- audit
- access review

This phase is critical.

---

## Phase 4 — HR

Integrate:
- Frappe HR

Expose:
- employee
- attendance
- leave
- payroll/payslips
- expenses
- performance
- onboarding
- offboarding

---

## Phase 5 — Work

Integrate:
- OpenProject

Expose:
- tasks
- projects
- boards
- Gantt
- workload
- time tracking

---

## Phase 6 — Requests + Workflow

Build:
- Request Center
- dynamic forms
- Approval Center
- workflow builder
- Temporal
- escalation
- delegation
- reminders
- audit

---

## Phase 7 — Knowledge + Documents

Integrate:
- self-hosted knowledge system
- Paperless
- MinIO
- Meilisearch

Build:
- unified Knowledge UI
- Document UI
- company policy center
- handbook
- SOPs

---

## Phase 8 — IT + Support

Integrate:
- GLPI
- Zammad

Build:
- My Devices
- IT Requests
- Tickets
- Access Requests
- Service Catalog

---

## Phase 9 — Analytics

Build:
- employee dashboard
- manager dashboard
- department analytics
- executive analytics
- admin health

---

## Phase 10 — AI

Build:
- AI search
- AI assistant
- Knowledge assistant
- AI summaries
- AI insights
- AI actions

---

## Phase 11 — Automation

Build:
- event-driven automation
- scheduled automation
- cross-system workflows
- AI agents
- durable orchestration

---

## Phase 12 — Advanced Intelligence

Future:
- organizational graph
- skills graph
- mentorship
- recognition
- innovation
- resource booking
- workplace management
- advanced AI agents

---

# 89. MVP

Start with:

```text
Authentication
RBAC
User Management
Home
Directory
Profiles
Teams
Departments
Global Search
Command Palette
Notifications
Attendance
Leave
My Work
Requests
Approvals
Knowledge
Admin
Audit
```

Do not launch 100 modules simultaneously.

---

# 90. VERSION 1

Add:

```text
Projects
Tasks
Documents
IT Helpdesk
Assets
Analytics
Performance
Expenses
Calendar
Announcements
Advanced Access Control
```

---

# 91. VERSION 2

Add:

```text
AI Assistant
AI Search
AI Knowledge
Workflow Builder
Automation
Executive Intelligence
```

---

# 92. VERSION 3

Add:

```text
AI Agents
Knowledge Graph
Skills Graph
Autonomous Workflows
Organization Intelligence
Resource Management
```

---

# 93. ROLE-BASED DASHBOARDS

## Employee

```text
My Work
Attendance
Leave
Approvals
Meetings
Notifications
Announcements
```

## Manager

```text
Team
Workload
Approvals
Performance
Projects
Team Analytics
```

## HR

```text
Employees
Attendance
Leave
Performance
Payroll
HR Workflows
HR Analytics
```

## CEO

```text
Company Health
Workforce
Finance
Operations
Strategic Goals
Risks
Decisions
```

## Admin

```text
Users
Roles
Permissions
Integrations
Workflows
Audit
Security
System Health
```

---

# 94. ACCESS CONTROL UI PRINCIPLES

Permission management UI must show:
- role
- inherited permissions
- direct permissions
- denied permissions
- scope
- expiration
- who granted it
- when it was granted
- why it was granted

Use:
- search
- filters
- grouped permissions
- comparison view
- diff view
- confirmation for sensitive changes

---

# 95. ADMIN PRIVILEGED ACTIONS

For highly sensitive actions:
- require re-authentication
- require explicit confirmation
- display impact
- write audit event
- optionally require second-admin approval

Examples:
- changing Super Admin
- granting global access
- changing security settings
- deleting integration
- disabling MFA
- bulk permission changes
- destructive data actions

This adds a strong break-glass/security model.

---

# 96. BREAK-GLASS MODEL

Create a controlled emergency mechanism.

Example:

```text
Emergency Access
 ↓
Strong re-authentication
 ↓
Reason required
 ↓
Temporary elevation
 ↓
Complete audit
 ↓
Automatic expiration
```

Do not create secret backdoors.

---

# 97. ACCESS REVIEW

Add recurring review cycles:

```text
Quarterly
Sensitive permissions
Temporary permissions
Inactive accounts
Manager access
HR access
Admin access
```

Admins can revoke stale access.

---

# 98. ORGANIZATIONAL POLICY ENGINE

Long-term, create reusable policy rules:

```text
IF user.role = manager
AND user.team_id = resource.team_id
THEN allow team.read

IF permission = payroll.view
AND user.department = HR
THEN allow

IF request.amount > threshold
THEN require extra approval
```

This can eventually power:
- workflows
- permissions
- approvals
- AI actions

---

# 99. AI + PERMISSION INTEGRATION

Every AI tool must use the same authorization engine as the portal.

Example:

```text
AI asks:
"What is Rahul's salary?"

Tool request
 ↓
Permission check
 ↓
User lacks permission
 ↓
AI refuses safely
```

Never rely on prompt instructions alone.

---

# 100. OBSERVABILITY FOR AI

Track:
- model
- request latency
- token usage if available
- tool calls
- failures
- refusal reasons
- hallucination reports
- user feedback

Do not log sensitive prompts/content unnecessarily.

Redact sensitive data in logs.

---

# 101. AI RELIABILITY

For important information, require:
- source citation
- retrieved context
- confidence indication where meaningful
- explicit "I don't know" behavior
- permission checks

For business actions:
- confirmation
- idempotency
- audit
- rollback/compensation where possible

---

# 102. FILE + KNOWLEDGE SECURITY

Every document should have:
- owner
- classification
- permissions
- retention policy
- source
- version
- audit history

Potential sensitivity classes:

```text
PUBLIC_INTERNAL
CONFIDENTIAL
RESTRICTED
HIGHLY_RESTRICTED
```

Use sensitivity to influence:
- search
- AI retrieval
- sharing
- download
- export

---

# 103. DATA EXPORT CONTROL

Not every user should be able to export everything they can view.

Create separate permissions:

```text
view
download
export
share
delete
```

Example:

```text
HR can view payroll
HR may export payroll only if explicitly allowed
```

This is an important enterprise control.

---

# 104. BULK ACTIONS

Any bulk action should:
- show affected count
- show sensitive fields impacted
- require confirmation
- support permission checking per object
- generate audit event
- fail safely

---

# 105. DELETE POLICY

Avoid destructive deletion.

Prefer:
- archive
- deactivate
- soft delete
- retention policies
- controlled permanent deletion

Permanent deletion should be a protected admin operation.

---

# 106. NOTIFICATION INTELLIGENCE

Avoid notification overload.

Build:
- grouping
- deduplication
- priority
- digest
- mute
- notification preferences
- action buttons

Example:

Instead of:
> 12 separate project notifications

show:

> Project X — 12 updates

---

# 107. UNIVERSAL DEEP LINKS

Every important object should have a stable URL:

```text
/people/[id]
/projects/[id]
/tasks/[id]
/requests/[id]
/documents/[id]
/tickets/[id]
/knowledge/[id]
/reports/[id]
```

Notifications, search results, AI responses, and emails should use these links.

---

# 108. COMMAND + SEARCH + AI

These should work together.

```text
Ctrl + K
 |
 +-- Search
 +-- Navigate
 +-- Create
 +-- Ask AI
 +-- Quick Action
```

Example:

```text
Ctrl + K
"leave balance"
```

Results:
- My Leave
- Leave Policy
- HR contact
- AI explanation

---

# 109. DESIGN FOR FUTURE CUSTOM MODULES

Allow custom modules through configuration rather than hard-coded route logic where reasonable.

A custom module may define:
- name
- route
- icon
- permissions
- navigation
- entity types
- forms
- workflows
- notifications
- search fields

Do not build a generic platform-within-a-platform unless actual requirements justify it.

---

# 110. RECOMMENDED ENTERPRISE FEATURES TO ADD

Beyond the initial list, consider:

## Access
- access reviews
- temporary access
- break-glass
- approval chains
- sensitivity classification

## Productivity
- universal command center
- contextual shortcuts
- saved searches
- smart defaults
- inline editing

## Management
- anomaly alerts
- decision center
- executive brief
- team health
- bottleneck detection

## Knowledge
- knowledge ownership
- content freshness reminders
- policy acknowledgment
- knowledge analytics

## Security
- session control
- export control
- data classification
- privileged action confirmation

## AI
- permission-aware assistant
- workflow assistant
- personalized daily brief
- company knowledge assistant
- executive summary
- proactive recommendations

---

# 111. PERSONALIZED DAILY BRIEF

A future employee feature:

```text
Good morning

Today:
3 meetings
5 tasks
1 approval

Important:
2 new announcements

At risk:
1 overdue task

Suggested:
Finish project review before 3 PM
```

Manager:

```text
Team Brief

2 approvals pending
1 overloaded team member
3 overdue tasks
1 attendance anomaly
```

CEO:

```text
Executive Brief

Headcount +4%
Attendance stable
2 operational risks
3 projects at risk
5 decisions pending
```

All outputs permission-aware.

---

# 112. WORLD-CLASS SEARCH

Future:
- keyword search
- exact search
- filters
- semantic search
- entity search
- AI answers
- organizational graph search

But do not ship advanced semantic search until basic search is accurate and fast.

---

# 113. WORLD-CLASS UX PRINCIPLES

Use the best characteristics of:
- Google
- Apple
- Linear
- Stripe
- Notion
- Microsoft

Do not copy their branding.

Borrow principles:
- simplicity
- clarity
- hierarchy
- speed
- consistency
- keyboard efficiency
- excellent defaults
- polished motion
- strong error handling
- low cognitive load

---

# 114. FEATURE PRIORITY FRAMEWORK

Classify every proposed feature:

## P0
Data/security/reliability blocker.

## P1
Major productivity/business impact.

## P2
Strategic capability.

## P3
Future/experimental.

Do not let P3 features delay P0/P1 work.

---

# 115. AGENT IMPLEMENTATION LOOP

For every development task:

```text
1. Inspect
2. Identify affected domains
3. Check existing libraries/services
4. Define approach
5. Assess migration risk
6. Implement smallest correct increment
7. Run tests
8. Run typecheck/lint
9. Review authorization
10. Review performance
11. Review accessibility
12. Update docs
13. Summarize
```

---

# 116. DO NOT OVER-ENGINEER

Avoid:
- needless abstractions
- unnecessary microservices
- premature distributed systems
- excessive generic frameworks
- duplicated infrastructure
- custom replacements for mature OSS

Prefer:
- modularity
- clear boundaries
- simplicity
- replaceability

---

# 117. SECURITY REVIEW BEFORE MERGE

For every sensitive feature ask:

```text
Can an unauthorized user call the API?
Can a user access another user's object?
Can search leak hidden data?
Can exports leak hidden data?
Can AI leak hidden data?
Can a manager access another department?
Can an admin grant themselves unexpected access?
Is the action audited?
Can the operation be replayed?
Can it be rolled back?
```

---

# 118. PERFORMANCE REVIEW BEFORE MERGE

Ask:

```text
Does this add client JS?
Does this add queries?
Can it cause N+1?
Can it use pagination?
Does it need a cache?
Can it be async?
Does it block navigation?
Does it work on slow networks?
```

---

# 119. ACCESSIBILITY REVIEW BEFORE MERGE

Ask:

```text
Can keyboard users complete the task?
Are focus states clear?
Are forms labelled?
Are errors announced?
Do dialogs trap focus correctly?
Does color alone communicate status?
Is reduced motion respected?
```

---

# 120. PRODUCTION RELEASE CHECKLIST

Before production:

```text
[ ] Tests pass
[ ] Typecheck passes
[ ] Lint passes
[ ] Security scan passes
[ ] Migration verified
[ ] Backup verified
[ ] Rollback documented
[ ] Monitoring enabled
[ ] Health checks enabled
[ ] External integrations tested
[ ] Permissions tested
[ ] Audit tested
[ ] Error states tested
[ ] Mobile tested
[ ] Accessibility reviewed
[ ] Feature flag configured
```

---

# 121. FINAL DEFINITION OF DONE

A production-ready feature must include:

```text
Product behavior
+
UX
+
API
+
Authorization
+
Validation
+
Database
+
Migration
+
Loading state
+
Empty state
+
Error state
+
Accessibility
+
Responsive design
+
Tests
+
Observability
+
Security
+
Documentation
```

---

# 122. FINAL BUILD ORDER

```text
AUDIT EXISTING PORTAL
        ↓
ARCHITECTURE + DATA OWNERSHIP
        ↓
DESIGN SYSTEM
        ↓
KEYCLOAK
        ↓
RBAC + ABAC
        ↓
POSTGRESQL + DRIZZLE
        ↓
AUDIT + OBSERVABILITY
        ↓
COMPANY OS SHELL
        ↓
PEOPLE
        ↓
SEARCH
        ↓
COMMAND CENTER
        ↓
NOTIFICATIONS
        ↓
ACCESS CONTROL CENTER
        ↓
FRAPPE HR
        ↓
MY WORK + OPENPROJECT
        ↓
REQUEST CENTER
        ↓
APPROVAL CENTER
        ↓
TEMPORAL WORKFLOWS
        ↓
KNOWLEDGE
        ↓
DOCUMENTS
        ↓
GLPI + ZAMMAD
        ↓
ANALYTICS
        ↓
CEO EXPERIENCE
        ↓
AI
        ↓
AUTOMATION
        ↓
AI AGENTS
        ↓
ORGANIZATIONAL INTELLIGENCE
```

---

# 123. FINAL ARCHITECTURAL POSITION

The best implementation strategy is:

```text
YOUR COMPANY OS
+
YOUR UX
+
YOUR PERMISSION MODEL
+
YOUR BUSINESS LOGIC
+
YOUR AI LAYER
+
OPEN-SOURCE SPECIALIZED SYSTEMS
```

not:

```text
One gigantic custom monolith
```

and not:

```text
Many unrelated applications exposed directly to employees
```

---

# 124. END-STATE EXPERIENCE

## Employee

One place to:
- work
- communicate
- check attendance
- apply leave
- find people
- access knowledge
- complete tasks
- request help
- approve their own items when needed
- interact with AI

## Manager

One place to:
- understand team status
- manage workload
- approve requests
- monitor performance
- coordinate projects
- review analytics

## HR

One place to:
- manage lifecycle
- handle HR workflows
- review attendance/leave
- manage policies
- run HR analytics

## CEO

One place to:
- understand company health
- see risks
- inspect department performance
- review strategic progress
- make decisions

## Admin

One place to:
- control the platform
- manage identity
- control permissions
- manage integrations
- audit everything
- monitor infrastructure

---

# 125. FINAL MISSION

The goal is not:

> Build the largest internal portal.

The goal is:

> **Build the best internal Company Operating System possible with the least unnecessary custom software.**

The final platform should be:

- world-class
- secure
- fast
- elegant
- scalable
- modular
- maintainable
- accessible
- permission-aware
- AI-native
- free/open-source-first
- resistant to vendor lock-in
- safe to evolve

---

# 126. ONE-SENTENCE FINAL ARCHITECTURE

> **Build a premium Next.js Company OS experience backed by a modular NestJS/PostgreSQL platform, Keycloak identity, fine-grained RBAC+ABAC authorization, event-driven integrations, specialized free/open-source systems for HR/projects/IT/documents/analytics/workflows, and a permission-aware AI layer across the organization.**

---

# 127. OFFICIAL CURRENT BASELINE SOURCES

Use official sources when implementing/upgrading:

- Next.js: https://nextjs.org/
- Next.js Blog/Release/Security: https://nextjs.org/blog
- React: https://react.dev/
- React Versions: https://react.dev/versions
- Keycloak: https://www.keycloak.org/
- Keycloak Downloads: https://www.keycloak.org/downloads
- Frappe HR: https://frappe.io/hr
- OpenProject: https://www.openproject.org/
- GLPI: https://glpi-project.org/
- Zammad: https://zammad.org/
- Paperless-ngx: https://github.com/paperless-ngx/paperless-ngx
- Metabase: https://www.metabase.com/
- Meilisearch: https://www.meilisearch.com/
- MinIO: https://min.io/
- Temporal: https://temporal.io/
- Tiptap: https://tiptap.dev/
- TanStack: https://tanstack.com/
- Radix UI: https://www.radix-ui.com/
- React Flow: https://reactflow.dev/
- ECharts: https://echarts.apache.org/
- OpenTelemetry: https://opentelemetry.io/
- LangGraph: https://www.langchain.com/langgraph
- Vercel AI SDK: https://ai-sdk.dev/
- PostgreSQL: https://www.postgresql.org/
- Redis: https://redis.io/

---

# 128. FINAL NON-NEGOTIABLES

1. Never compromise data integrity.
2. Never bypass authorization.
3. Never let AI bypass authorization.
4. Never expose unauthorized search results.
5. Never make the UI the only security boundary.
6. Never destroy existing data to simplify implementation.
7. Never rebuild mature open-source infrastructure without a compelling reason.
8. Never introduce a paid-only core dependency when a viable free/open-source option exists.
9. Never use an external product without checking its license and maintenance status.
10. Never ship an important feature without tests and observability.
11. Never make one external integration capable of taking down the whole portal.
12. Never create a confusing admin permission interface.
13. Never make role permissions hard-coded if they can be modeled as data.
14. Never give CEO or Admin access broader than policy requires.
15. Never treat "admin" as an excuse to ignore least privilege.
16. Never make advanced architecture reduce everyday UX quality.
17. Never optimize the screenshot instead of the workflow.
18. Never add AI for marketing value alone.
19. Never introduce infrastructure complexity without measurable benefit.
20. Always keep the Company OS unified from the user's perspective.

---

# 129. FINAL SUCCESS DEFINITION

The project is successful when:

```text
Employee
  ↓
logs in once
  ↓
opens one home
  ↓
finds anything through one search
  ↓
completes work in one interface
  ↓
requests/approves through one workflow center
  ↓
gets company knowledge through one place
  ↓
uses one AI assistant
  ↓
and never needs to understand which backend system powers the feature.
```

At the same time:

```text
Manager
CEO
HR
IT
Finance
Admin
```

each receives an experience tailored to their authority.

And underneath:

```text
Identity
HR
Projects
IT
Documents
Analytics
Workflow
AI
```

remain modular, replaceable, observable, secure, and independently maintainable.
