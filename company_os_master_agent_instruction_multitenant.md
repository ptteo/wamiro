# COMPANY OS — MASTER CODING AGENT INSTRUCTION
## Authoritative Instructions for Implementing the Internal Company Portal

**Status:** MASTER INSTRUCTION  
**Purpose:** This file defines how the coding agent must inspect, design, implement, test, secure, migrate, and continuously improve the Company OS.

**Source of truth:** Use the attached/current Company OS end-to-end blueprint as the product and architecture reference. If the repository differs from the blueprint, inspect the repository first and adapt safely rather than blindly replacing working systems.

---

# 1. PRIMARY MISSION


# 1A. COMMERCIAL / MULTI-TENANT PRODUCT DIRECTIVE

This is not permanently an internal Howdy Analytics application.

The product must be implemented as a **standalone multi-tenant Company OS platform** that can later be sold to many unrelated organizations.

Howdy Analytics is the first tenant/customer.

Conceptually:

```text
PRODUCT PLATFORM
    |
    +-- Tenant: Howdy Analytics
    +-- Tenant: Company A
    +-- Tenant: Company B
    +-- Tenant: Company C
```

Never hard-code Howdy Analytics as the product identity.

The product itself must have an independent brand.

Example:

```text
Platform:
Nexora

Tenant:
Howdy Analytics
```

The customer's company name/logo should be primary inside its workspace.

---

# 1B. TENANT-FIRST ARCHITECTURE

Every tenant must have isolated:

- users
- employees
- departments
- teams
- roles
- permissions
- workflows
- documents
- requests
- approvals
- notifications
- analytics
- AI data
- search data
- integrations
- branding
- configuration

Tenant isolation is a security boundary, not merely a UI concept.

The server must determine tenant context from:
- authenticated identity
- verified hostname/subdomain/custom domain
- explicit tenant membership

Never trust a client-provided `organization_id` without verifying membership and authorization.

---

# 1C. TENANT DATA MODEL

Core tenant entity:

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

Tenant-owned business records should contain an appropriate:

```text
organization_id
```

Do not rely on developers remembering to add tenant filters manually.

Create centralized tenant-scoping mechanisms.

---

# 1D. TENANT ISOLATION REQUIREMENT

A user belonging to Tenant A must never access Tenant B:

- API records
- database records
- search results
- files
- documents
- AI context
- notifications
- reports
- analytics
- workflows
- integrations
- cached data
- background-job payloads

Cross-tenant data access is a **release-blocking security failure**.

---

# 1E. TENANT-AWARE CACHING

Every cache key that contains tenant-specific data must include tenant context.

Bad:

```text
employee:123
```

Good:

```text
tenant:{tenantId}:employee:123
```

Never allow cached responses from one tenant to be returned to another.

---

# 1F. TENANT-AWARE QUEUES

Every background job must carry tenant context.

Example:

```text
{
  tenantId,
  jobType,
  entityId
}
```

Workers must verify tenant authorization before processing tenant data.

---

# 1G. TENANT-AWARE SEARCH

Every search document must contain tenant isolation metadata.

Search queries must be tenant-scoped before results are returned.

Test cross-tenant search leakage automatically.

---

# 1H. TENANT-AWARE AI

AI must inherit:

```text
tenant
+
identity
+
effective permissions
```

The AI must never retrieve or reason over another tenant's information.

Vector indexes, embeddings, retrieved documents, tool calls, and conversation context must be tenant-aware.

---

# 1I. TENANT-AWARE FILES

Store files using tenant isolation.

Example:

```text
tenant/{organizationId}/documents/
tenant/{organizationId}/employees/
tenant/{organizationId}/exports/
tenant/{organizationId}/assets/
```

Do not expose predictable unrestricted object-storage paths.

---

# 1J. TENANT-AWARE AUDIT

Every audit record must contain:

```text
organization_id
actor_user_id
action
entity_type
entity_id
timestamp
metadata
request_id
```

Platform-level events and tenant business events must remain distinguishable.

---

# 1K. PLATFORM ADMIN VS TENANT ADMIN

There are two different administration layers.

## Platform Super Admin

Controls the SaaS/platform layer:

- tenant registry
- platform configuration
- global feature flags
- deployment/version information
- platform health
- platform security
- infrastructure
- support tooling

Platform operators must not casually browse tenant business data.

If support access is required, use explicit:

```text
break-glass
+
reason
+
time-limited elevation
+
complete audit
```

## Tenant Admin

Controls only their organization:

- users
- departments
- teams
- roles
- permissions
- branding
- modules
- workflows
- integrations
- company configuration
- audit within their tenant

Tenant Admin must never manage another tenant.

---

# 1L. CUSTOMER BRANDING

The portal should dynamically display the tenant's identity.

Tenant configuration includes:

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
Timezone
Locale
Currency
Language
```

Inside Howdy Analytics:

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
Admin
```

Inside another tenant:

```text
Acme Technologies
Home
My Work
People
Projects
Knowledge
Requests
Analytics
AI
Admin
```

Same product. Different tenant identity.

Do not hard-code customer branding into shared components.

---

# 1M. TENANT MODULE CONFIGURATION

Tenants should be able to enable/disable modules.

Example:

```text
Tenant A
✓ HR
✓ Projects
✓ Knowledge
✓ IT
✓ AI
✗ Finance
```

The module state must affect:

- navigation
- UI routes
- API authorization
- background jobs
- integrations
- dashboards

Do not simply hide disabled modules visually.

---

# 1N. ORGANIZATION ONBOARDING

Build a tenant setup wizard.

Recommended flow:

```text
Company Name
↓
Industry
↓
Country
↓
Timezone
↓
Logo/Branding
↓
Departments
↓
Initial Admin
↓
Modules
↓
Default Roles
↓
Invite Employees
↓
Integrations
↓
Finish
```

Automatically create:

```text
Organization
Tenant Admin
Default Roles
Default Permissions
Default Settings
Default Workflows
Default Dashboard
Branding
```

---

# 1O. TENANT DOMAINS

Support:

```text
tenant.product.com
```

and architect toward:

```text
portal.customer.com
```

Tenant resolution:

```text
hostname
↓
tenant
↓
branding
↓
identity
↓
permissions
↓
data
```

The tenant must be resolved server-side.

---

# 1P. TENANT CUSTOMIZATION

Support configuration for:

- branding
- module selection
- roles
- permissions
- custom fields
- workflows
- notification rules
- dashboards
- integrations
- AI settings
- policies

Do not build customer-specific behavior as one-off code branches when configuration can solve the requirement.

---

# 1Q. FUTURE SAAS READINESS

The architecture should support future concepts without requiring them immediately:

```text
plans
subscriptions
feature_entitlements
usage
limits
billing_status
trial_status
```

Billing is not a core requirement for the internal deployment.

Do not make the product dependent on a paid billing provider.

---

# 1R. MULTI-TENANT TESTING

Every release must include cross-tenant isolation tests.

Examples:

```text
Tenant A employee cannot read Tenant B employee
Tenant A admin cannot manage Tenant B users
Tenant A search cannot return Tenant B records
Tenant A AI cannot retrieve Tenant B knowledge
Tenant A document URL cannot expose Tenant B files
Tenant A export cannot contain Tenant B data
Tenant A workflow cannot operate on Tenant B entity
Tenant A cache cannot return Tenant B response
Tenant A background job cannot process Tenant B data
```

A cross-tenant isolation failure blocks release immediately.

---


Transform the existing portal into a:

> **World-class internal Company Operating System**

for:

- Employees
- Managers
- HR
- IT
- Finance
- Executives / CEO
- Administrators

The final product must feel like **one premium product**, even when specialized open-source systems power different domains underneath it.

The portal should provide:

```text
One Login
One Home
One Navigation
One Search
One Employee Directory
One Employee Profile
One Notification Center
One Task Center
One Request Center
One Approval Center
One Knowledge Experience
One Document Experience
One Workflow System
One AI Assistant
One Management Dashboard
One Admin Console
```

---

# 2. ABSOLUTE PRIORITIES

Always prioritize in this order:

```text
1. Data Integrity
2. Security
3. Correctness
4. Reliability
5. Authorization
6. Performance
7. UX
8. Maintainability
9. Scalability
10. Feature breadth
```

Never trade data integrity or security for implementation speed.

---

# 3. THE GOLDEN RULE

Do not build the biggest portal.

Build:

> **The best internal company operating system with the least unnecessary custom software.**

Use existing mature free/open-source products and libraries wherever practical.

Build only the company-specific layer that creates real value.

---

# 4. MANDATORY FIRST ACTION: INSPECT

Before modifying code, deeply inspect the repository.

Inspect:

## Repository
- root structure
- package manager
- workspace configuration
- scripts
- CI/CD
- environment files
- deployment files

## Frontend
- routes
- layouts
- page components
- UI components
- state management
- data fetching
- API clients
- styling
- theme
- accessibility
- responsive behavior

## Backend
- modules
- controllers
- services
- repositories
- guards
- middleware
- validation
- authorization
- logging
- error handling

## Database
- schema
- migrations
- relations
- indexes
- constraints
- duplicate tables
- duplicate columns
- data assumptions
- seed data

## Existing product
- roles
- permissions
- dashboards
- workflows
- notifications
- attendance
- HR features
- reports
- integrations
- admin features

## Infrastructure
- Docker
- CI/CD
- deployment
- secrets
- monitoring
- logging
- backups
- health checks

Do not make architectural claims until the repository has actually been inspected.

---

# 5. CURRENT CODEBASE SAFETY

Never assume the current portal is disposable.

For every existing feature classify it:

```text
KEEP
REFACTOR
REPLACE
INTEGRATE
REMOVE
```

Use evidence.

Do not rewrite working systems simply because another implementation is aesthetically cleaner.

---

# 6. NO DATA LOSS


# 6A. TENANT ISOLATION IS DATA INTEGRITY

Tenant leakage is equivalent to data loss.

A bug that exposes Tenant B data to Tenant A is a critical production incident even if no records were modified.

Treat:
- cross-tenant read access
- cross-tenant search
- cross-tenant AI retrieval
- cross-tenant file access
- cross-tenant export
- cross-tenant cache pollution

as critical security defects.


This is non-negotiable.

Never:

- casually drop tables
- casually delete columns
- recreate production databases
- overwrite existing data
- truncate business tables
- remove users
- delete documents
- destroy migrations
- disable audit trails
- run destructive SQL against production casually

Before destructive or risky changes:

```text
Backup
↓
Test
↓
Validate
↓
Migrate
↓
Verify
↓
Release
↓
Monitor
```

For risky schema changes use:

```text
Expand
↓
Deploy compatible code
↓
Backfill
↓
Switch
↓
Contract later
```

---

# 7. FREE / OPEN-SOURCE-ONLY REQUIREMENT

The core platform must use:

- free
- self-hosted
- open-source
- license-compatible

software where available.

Do not introduce a paid-only dependency into the core architecture without explicit justification.

Before adding a dependency, verify:

1. Current stable version
2. Official repository
3. License
4. Maintenance activity
5. Security history
6. Self-hosting capability
7. API availability
8. Data export
9. Replaceability
10. Whether required functionality is paywalled

Never assume "free" means "safe to embed into proprietary code."

Prefer separate-service/API integration where license obligations make direct source integration undesirable.

---

# 8. REFERENCE STACK

Use the existing stack when healthy. Preferred target:

## Frontend

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
Radix UI
Lucide
TanStack Query
TanStack Table
Zustand
React Hook Form
Zod
Tiptap
cmdk
FullCalendar
dnd-kit
React Flow
Apache ECharts
date-fns
next-themes
next-intl
```

## Backend

```text
NestJS
PostgreSQL
Drizzle ORM
Redis
BullMQ
Temporal
Zod
OpenTelemetry
```

## Specialized open-source services

```text
Keycloak        → Identity / SSO / MFA
Frappe HR       → HR / Attendance / Leave / Payroll
OpenProject     → Projects / Tasks / Gantt
GLPI            → IT Assets / ITSM
Zammad          → Helpdesk / Tickets
Paperless-ngx   → Documents / OCR
Meilisearch     → Search
MinIO           → Object Storage
Metabase OSS    → BI / Analytics
Temporal        → Durable workflows
```

## AI

```text
Vercel AI SDK
LangGraph
PostgreSQL
pgvector
Zod
```

## Observability

```text
OpenTelemetry
Prometheus
Grafana
Loki
Tempo
```

Do not deploy every service on day one. Add them as their phases become necessary.

---

# 9. CURRENT VERSION POLICY

Before installing/upgrading any dependency:

1. Verify the latest stable release from the official project.
2. Check compatibility with the current repository.
3. Check known security advisories.
4. Check license.
5. Pin the exact production version.
6. Commit the lockfile.
7. Test in staging before production.

Do not trust outdated version lists in old documents.

The current project blueprint is a planning document, not permission to install stale packages.

---

# 10. TARGET PRODUCT

The target Company OS should conceptually look like:

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

# 11. SYSTEM ARCHITECTURE

Preferred structure:

```text
Users
  ↓
Next.js Company OS
  ↓
NestJS API / BFF
  ↓
Domain Services
  ↓
PostgreSQL / Redis / Search
  ↓
Integration Adapters
  ↓
Specialized Open-Source Systems
```

The Company OS is the experience/orchestration layer.

---

# 12. DOMAIN BOUNDARIES

Recommended domains:

```text
auth
users
organizations
departments
teams
employees
attendance
leave
tasks
projects
goals
calendar
notifications
announcements
documents
knowledge
requests
approvals
workflows
tickets
assets
analytics
ai
integrations
audit
admin
health
```

Avoid "god services" and giant controllers.

---

# 13. MONOREPO

Preferred target:

```text
company-os/

apps/
  web/
  api/
  worker/

packages/
  ui/
  db/
  auth/
  permissions/
  validation/
  events/
  integrations/
  search/
  notifications/
  workflows/
  ai/

infrastructure/
  docker/
  monitoring/
  deployment/

docs/
  architecture/
  security/
  product/
  api/
  operations/

tooling/
```

Adapt to the existing repository where a different structure is already working.

---

# 14. ROLE MODEL

The platform must support:

```text
SUPER ADMIN
CEO / EXECUTIVE
HR ADMIN
DEPARTMENT ADMIN
MANAGER
EMPLOYEE
CUSTOM ROLE
```

Do not hardcode only:

```text
employee
manager
ceo
admin
```

---

# 15. SUPER ADMIN

Create a dedicated **Super Admin** capability.

Super Admin may control:

- users
- roles
- permissions
- organizations
- departments
- teams
- integrations
- workflows
- feature flags
- security
- audit
- system configuration
- system health
- platform modules

Super Admin must use:

- MFA
- privileged action auditing
- strong session controls
- optional re-authentication for destructive actions
- recovery/break-glass procedure

Do not implement `isAdmin = true` as the security model.

---

# 16. CEO ACCESS

CEO should have broad business access but not automatically all technical secrets.

CEO can normally access:

- company KPIs
- workforce overview
- department performance
- strategic goals
- projects
- business reports
- risks
- alerts
- decision center
- executive analytics

Explicit permission may be required for sensitive HR/compensation information.

CEO should not automatically receive:
- passwords
- secrets
- encryption keys
- infrastructure credentials
- token material

---

# 17. MANAGER ACCESS

Default scope = TEAM.

Manager can access:
- assigned team
- team attendance
- team leave
- team workload
- team tasks
- team projects
- team performance
- team approvals
- team analytics
- team announcements
- 1:1s

Manager cannot automatically access unrelated departments.

---

# 18. EMPLOYEE ACCESS

Default scope = SELF.

Employee can access:
- own profile
- own attendance
- own leave
- own documents
- own tasks
- own approvals
- own requests
- own tickets
- assigned projects
- authorized company knowledge
- company announcements

---

# 19. RBAC + ABAC

Use:

```text
ROLE
+
PERMISSION
+
SCOPE
+
CONTEXT / ATTRIBUTE
+
OPTIONAL EXPIRATION
```

Scopes:

```text
SELF
TEAM
DEPARTMENT
COMPANY
GLOBAL
```

Examples:

```text
Manager
attendance.view_team
scope=TEAM

HR
attendance.view_company
scope=COMPANY

Employee
attendance.view_self
scope=SELF
```

Contextual attributes may include:
- organization
- department
- team
- location
- project
- role
- sensitivity
- employment status

---

# 20. PERMISSIONS

Use granular permissions:

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

# 21. PERMISSION PRECEDENCE

Define one deterministic policy.

Preferred:

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

Implement it consistently.

---

# 22. PERMISSION MANAGEMENT UI

Authorized Admin/CEO users should have:

```text
Administration
  └── Access Control
      ├── Users
      ├── Roles
      ├── Permissions
      ├── Role Assignment
      ├── Permission Overrides
      ├── Access Requests
      ├── Temporary Access
      ├── Access Reviews
      └── Audit History
```

UI must be exceptionally clear.

Show:

```text
USER
ROLE
INHERITED PERMISSIONS
DIRECT PERMISSIONS
DENIED PERMISSIONS
SCOPE
EXPIRATION
WHO GRANTED IT
WHEN GRANTED
WHY GRANTED
```

---

# 23. TEMPORARY ACCESS

Support:

```text
Permission
Scope
Start
Expiration
Reason
Approver
```

Automatically revoke at expiration.

Audit every grant/revoke.

---

# 24. ACCESS REQUESTS

Employees should request access:

```text
Employee
 ↓
Select resource
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

Use the same workflow engine as other requests.

---

# 25. ACCESS REVIEWS

Add recurring access reviews.

Review:
- sensitive permissions
- temporary access
- inactive accounts
- manager privileges
- HR privileges
- admin privileges
- unused privileges

Allow:
- approve
- renew
- revoke
- investigate

This is an important enterprise capability.

---

# 26. BREAK-GLASS ADMIN ACCESS

For emergency actions:

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

Never create secret backdoors.

---

# 27. NAVIGATION SECURITY

Navigation should be permission-aware.

An employee should not see admin-only areas.

But remember:

> Hiding UI is not security.

Every API/database operation must enforce authorization independently.

---

# 28. AUTHENTICATION

Use Keycloak.

Keycloak should provide:
- SSO
- OIDC
- OAuth
- SAML
- MFA
- groups
- roles
- sessions
- identity federation

Company OS should provide:
- business authorization
- resource permissions
- scopes
- overrides

---

# 29. DATABASE

Use PostgreSQL + Drizzle.

Core tables:

```text
organizations
organization_settings

users
user_identities

employees
employee_profiles

departments
teams
team_members

roles
permissions
role_permissions
user_roles
user_permission_overrides

locations
job_titles
employment_types

user_preferences
sessions

notifications
notification_preferences

activities
audit_logs

favorites
recent_items

announcements
comments
mentions
reactions

files
documents
document_permissions

requests
request_types

approvals
approval_steps

workflows
workflow_versions
workflow_runs

integrations
integration_records

feature_flags
system_settings
```

---

# 30. DATABASE RULES

Use:
- UUID IDs
- foreign keys
- unique constraints
- indexes based on actual queries
- transactions
- timestamps
- organization scoping
- soft deletion where appropriate

Never store large files directly in PostgreSQL.

---

# 31. DATA OWNERSHIP

Company OS should own:
- organization structure
- portal preferences
- permissions/overrides
- notifications
- requests
- approvals
- workflows
- audit
- integrations
- company-specific configuration

Specialized systems should own:
- HR records in Frappe HR
- projects in OpenProject
- IT assets in GLPI
- tickets in Zammad
- document archive in Paperless where used

---

# 32. INTEGRATION ARCHITECTURE

Create adapters:

```text
packages/integrations/
  keycloak/
  frappe/
  openproject/
  glpi/
  zammad/
  erpnext/
  google/
  microsoft/
  storage/
```

Use stable internal interfaces:

```text
EmployeeProvider
LeaveProvider
AttendanceProvider
ProjectProvider
AssetProvider
TicketProvider
CalendarProvider
```

Business logic must never be tightly coupled to vendor SDKs.

---

# 33. EXTERNAL IDs

Use:

```text
integration_records

id
system
entity_type
entity_id
external_id
last_synced_at
sync_status
last_error
```

---

# 34. SYNC

Use:
- webhooks
- scheduled reconciliation
- on-demand reads

Every integration must support:
- timeout
- retry
- logging
- health status
- last success
- last failure
- reconciliation

---

# 35. GRACEFUL DEGRADATION

If an external service fails, unrelated areas must continue working.

Examples:

```text
HR unavailable
→ projects still work

AI unavailable
→ portal still works

Search unavailable
→ normal navigation still works

Analytics unavailable
→ transactions still work
```

---

# 36. EMPLOYEE EXPERIENCE

Employee Home should show:

```text
Today
My Tasks
Approvals
Meetings
Notifications

Quick Actions
Clock In
Apply Leave
Create Request
Search Knowledge

My Work
Priority Tasks
Projects
Deadlines

Company
Announcements
Events
Important Updates
```

Keep the first screen focused on action.

---

# 37. MANAGER EXPERIENCE

Manager Home should show:

```text
Team Members
Attendance
Leave
Workload
Overdue Tasks
Approvals
Performance
Team Analytics
```

---

# 38. CEO EXPERIENCE

CEO Home should show:

```text
Company Health
Workforce
Finance
Operations
Strategic Goals
Risks
Alerts
Decisions
```

Do not expose raw BI tooling as the primary executive UI.

---

# 39. ADMIN EXPERIENCE

Admin Home:

```text
Users
Organizations
Roles
Permissions
Integrations
Workflows
Feature Flags
Audit
Security
System Health
```

---

# 40. HR INTEGRATION

Use Frappe HR.

Do not rebuild:
- HR records
- attendance engine
- leave engine
- payroll
- performance internals
- onboarding engine

Build:
- unified UX
- permissions
- notifications
- cross-system views

---

# 41. PROJECT MANAGEMENT

Use OpenProject.

Do not rebuild:
- Gantt
- project engine
- work package engine
- project planning

Build:
- My Work
- unified task view
- manager workload
- executive project health

---

# 42. IT + HELPDESK

Use:

```text
GLPI → assets / ITSM
Zammad → helpdesk / tickets
```

Company OS front door:

```text
My Devices
My Tickets
Create Ticket
Request Access
Report Issue
Knowledge
Service Catalog
```

---

# 43. DOCUMENTS

Use:

```text
MinIO
Paperless-ngx
Meilisearch
Temporal
```

Pipeline:

```text
Upload
 ↓
Storage
 ↓
Queue
 ↓
OCR/Text Extraction
 ↓
Metadata
 ↓
Embedding
 ↓
Search
```

---

# 44. KNOWLEDGE

Use a self-hosted open-source wiki after checking:
- license
- maintenance
- API
- import/export
- permissions
- search

Candidates:
- Wiki.js
- BookStack

Do not create a full wiki engine unless there is a specific business requirement.

---

# 45. WORKFLOW ENGINE

Use Temporal.

Visual builder:
- React Flow

Forms:
- React Hook Form
- Zod

Execution:

```text
Request
 ↓
Validate
 ↓
Authorize
 ↓
Workflow
 ↓
Approval
 ↓
External Action
 ↓
Notification
 ↓
Audit
```

---

# 46. REQUEST CENTER

Support:
- Leave
- Expense
- Purchase
- Travel
- IT access
- Equipment
- HR
- Administrative
- Custom company workflows

Do not make each request a unique hard-coded feature when a schema-driven request framework can handle it.

---

# 47. APPROVAL CENTER

Centralize all approvals.

Approval cards should show:
- requester
- purpose
- amount or impact
- context
- attached information
- current workflow step
- history
- required action

Use keyboard shortcuts for fast approval/rejection where appropriate.

---

# 48. NOTIFICATIONS

Central notification system.

Channels:
- in-app
- email
- PWA push where necessary

Support:
- priority
- grouping
- deduplication
- digest
- mute
- preferences
- deep links

Avoid notification spam.

---

# 49. SEARCH

Use Meilisearch.

Index:
- employees
- teams
- departments
- projects
- tasks
- documents
- knowledge
- policies
- tickets
- requests
- announcements

Search must be permission-aware.

---

# 50. COMMAND PALETTE

Use cmdk.

Shortcut:

```text
Ctrl/Cmd + K
```

Support:
- navigate
- search
- create
- approve
- open
- AI

---

# 51. AI

AI must be deeply integrated, not a decorative page.

Use:

```text
Vercel AI SDK
LangGraph
pgvector
PostgreSQL
Zod
```

Capabilities:
- Company AI Assistant
- AI Search
- Knowledge Assistant
- Employee Assistant
- Manager Assistant
- Executive Assistant
- Report summaries
- Meeting summaries
- Analytics insights
- Workflow help
- AI recommendations
- AI agents

---

# 52. AI TOOLS

Never allow:

```text
AI → unrestricted SQL
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
Data
```

Example tools:

```text
get_my_tasks()
get_my_leave_balance()
get_my_approvals()
search_company_knowledge()
get_team_members()
get_team_metrics()
create_request()
```

---

# 53. AI PERMISSIONS

AI must inherit exact user permissions.

If a user cannot access:
- salary
- HR records
- private documents
- another department

the AI cannot access them either.

Search and retrieval must use the same authorization model as the application.

---

# 54. AI WRITE ACTIONS

Sensitive writes require confirmation unless policy explicitly allows the action.

Examples:
- submit leave
- approve request
- change permissions
- send company communication
- modify sensitive employee data

Use:

```text
Preview
+
Confirmation
+
Idempotent execution
+
Audit
```

---

# 55. AI SOURCES

For important knowledge answers:
- retrieve authoritative documents
- provide source references
- indicate uncertainty where meaningful
- prefer "I don't know" over invention

Do not hallucinate:
- payroll
- policies
- legal/compliance guidance
- security facts
- employee permissions

---

# 56. AI OBSERVABILITY

Track:
- model
- latency
- request outcome
- tool usage
- errors
- user feedback
- sensitive-data redaction

Do not log sensitive prompts unnecessarily.

---

# 57. ORGANIZATIONAL KNOWLEDGE GRAPH

Build incrementally.

Source relationships from:
- users
- employees
- teams
- departments
- projects
- tasks
- documents
- knowledge
- goals
- meetings
- skills
- requests

Use it later for:
- AI
- semantic search
- recommendations
- organization insights
- automation

Do not make a graph database a mandatory prerequisite on day one.

---

# 58. ANALYTICS

Use:
- Metabase OSS
- ECharts
- PostgreSQL
- analytics DB when necessary

Build a metric registry.

Every KPI should define:
- name
- formula
- source
- owner
- refresh
- sensitivity

Do not let different dashboards calculate the same KPI differently.

---

# 59. EXECUTIVE ANALYTICS

Answer:
- what happened?
- what changed?
- why?
- what is at risk?
- what needs action?

Use:
- trends
- anomalies
- drilldowns
- summaries
- alerts
- actions

---

# 60. ACCESS-SENSITIVE ANALYTICS

A user may have permission to view an aggregate but not raw employee rows.

Support:
- aggregate access
- row-level access
- sensitive-field restrictions
- export restrictions

---

# 61. EXPORT CONTROL

Viewing a record does not automatically mean exporting it.

Separate permissions:

```text
view
download
export
share
delete
```

Sensitive exports should be audited.

---

# 62. DOCUMENT SENSITIVITY

Support classifications:

```text
PUBLIC_INTERNAL
CONFIDENTIAL
RESTRICTED
HIGHLY_RESTRICTED
```

Sensitivity should affect:
- viewing
- search
- AI retrieval
- download
- export
- sharing

---

# 63. USER LIFECYCLE

Support:

```text
Invited
 ↓
Onboarding
 ↓
Active
 ↓
Suspended / Leave
 ↓
Offboarding
 ↓
Inactive
```

Do not immediately delete terminated employees.

Preserve records according to policy.

---

# 64. ONBOARDING AUTOMATION

When employee is created:

```text
Create account
 ↓
Assign organization/team
 ↓
Create onboarding checklist
 ↓
Create IT request
 ↓
Assign assets
 ↓
Assign training
 ↓
Send policies
 ↓
Notify manager
```

Use Temporal workflows.

---

# 65. OFFBOARDING AUTOMATION

```text
Offboarding approved
 ↓
Restrict account
 ↓
Review access
 ↓
Recover assets
 ↓
Revoke permissions
 ↓
Archive required data
 ↓
Notify stakeholders
 ↓
Audit
```

---

# 66. DESIGN SYSTEM

Use one shared design system.

Recommended primitives:
- Button
- Input
- Dialog
- Drawer
- Sheet
- Table
- DataTable
- Tabs
- Form
- Command
- Calendar
- Tooltip
- Popover
- Badge
- Avatar
- Card
- Chart
- Empty State
- Loading State
- Error State
- Permission Gate

Do not reinvent accessible primitives.

---

# 67. UI/UX QUALITY BAR

The interface should feel:

- premium
- calm
- fast
- minimal
- clear
- coherent
- consistent
- polished
- responsive

Borrow principles from:
- Google
- Apple
- Linear
- Stripe
- Notion
- Microsoft

Do not copy branding or visual identity.

---

# 68. UX RULES

Every page must answer:

```text
Where am I?
What can I do?
What is important?
What should I do next?
```

Primary action should be obvious.

Do not bury important actions in nested menus.

---

# 69. LOADING STATES

Use:
- skeletons
- progressive loading
- suspense
- streaming
- optimistic UI where safe

Never show a completely blank screen while loading.

---

# 70. EMPTY STATES

Good:

> No pending approvals. You're all caught up.

Bad:

> No data.

Empty states should guide the next action.

---

# 71. ERROR STATES

Every error must explain:

1. what happened
2. why it happened when known
3. what the user can do

Provide retry/recovery actions when possible.

---

# 72. ACCESSIBILITY

Every feature:
- keyboard accessible
- visible focus
- semantic HTML
- accessible labels
- screen-reader support
- contrast
- reduced-motion support
- accessible errors
- accessible dialogs

---

# 73. MOBILE

Build responsive web first.

Prioritize:
- clock in/out
- leave
- approvals
- notifications
- announcements
- directory
- requests

Only build native apps when justified.

---

# 74. FRONTEND DATA STATE

Use:

### Server state
TanStack Query

### Local state
React state

### Global UI state
Zustand only when needed

### URL state
Filters, sorting, pagination, search

Do not put everything into a global store.

---

# 75. PERFORMANCE

Always check:
- bundle size
- client JS
- API latency
- DB queries
- N+1 queries
- caching
- rendering
- network waterfalls
- large list virtualization

Use:
- server components where appropriate
- lazy loading
- prefetching
- pagination
- virtualization
- caching

---

# 76. DATABASE PERFORMANCE

Before shipping a heavy query:
- inspect query plan
- add correct indexes
- avoid N+1
- fetch only needed columns
- paginate
- use cursor pagination for large data where suitable

---

# 77. BACKGROUND JOBS

Use BullMQ + Redis for:

```text
emails
notifications
sync
indexing
embeddings
exports
reports
cleanup
```

Use Temporal for:

```text
approvals
onboarding
offboarding
multi-step workflows
cross-system actions
durable automation
```

---

# 78. EVENT MODEL

Use events:

```text
employee.created
employee.updated

leave.requested
leave.approved
leave.rejected

request.created
request.approved
request.rejected

task.created
task.completed

document.uploaded
document.approved

announcement.published

workflow.started
workflow.completed
```

Events may trigger:
- notifications
- audit
- search
- analytics
- AI indexing
- integrations

---

# 79. API

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

Never expose vendor APIs directly to the browser.

---

# 80. API ERROR MODEL

Use standardized errors:

```text
code
message
details
request_id
```

Do not leak:
- database errors
- SQL
- stack traces
- secrets
- internal service details

to normal users.

---

# 81. SECURITY TESTING

Must test:
- IDOR
- privilege escalation
- object access
- search leakage
- document leakage
- AI leakage
- export leakage
- session security
- role changes
- temporary access expiry

---

# 82. TESTING

## Unit
- permission calculations
- business logic
- validators
- calculations

## Integration
- database
- integrations
- search
- queues
- workflows

## E2E
- login
- attendance
- leave
- request
- approval
- tasks
- documents
- notifications
- permission management

## Security
- unauthorized access
- privilege escalation
- data leakage
- AI bypass

---

# 83. CI/CD

Every PR:

```text
Lint
Typecheck
Unit Tests
Integration Tests
Security Scan
Build
Migration Check
```

Then:

```text
Preview
 ↓
Staging
 ↓
Smoke Tests
 ↓
Production
```

---

# 84. BACKUPS

PostgreSQL:
- full backup
- PITR/WAL where appropriate
- offsite copy
- encryption
- restore tests

Object storage:
- versioning
- backup
- recovery testing

Never assume backups work without testing restoration.

---

# 85. MIGRATION STRATEGY

For the existing portal:

```text
Current System
 ↓
Backup
 ↓
Audit
 ↓
Mapping
 ↓
Migration
 ↓
Validation
 ↓
Dual Read where appropriate
 ↓
Cutover
 ↓
Monitoring
```

Validate:
- users
- departments
- teams
- roles
- permissions
- attendance
- leave
- requests
- approvals
- documents

---

# 86. FEATURE PRIORITY

Use:

## P0
Security, data integrity, production blockers, critical reliability

## P1
Major productivity/business value

## P2
Strategic capabilities

## P3
Future/experimental

Do not delay P0/P1 for P3.

---

# 87. IMPLEMENTATION PHASES

## Phase 0
Audit existing system.

## Phase 1
Foundation + design system + security.

## Phase 2
Company OS shell.

## Phase 3
Permission management center.

## Phase 4
Frappe HR integration.

## Phase 5
OpenProject integration.

## Phase 6
Requests + approvals + Temporal.

## Phase 7
Knowledge + documents + search.

## Phase 8
GLPI + Zammad.

## Phase 9
Analytics + executive dashboards.

## Phase 10
AI.

## Phase 11
Automation + agents.

## Phase 12
Organizational intelligence.

---

# 88. MVP

The first production milestone should include:

```text
Authentication
Super Admin
Role/Permission Management
Employee
Manager
CEO basic dashboard
Home
Directory
Profiles
Teams
Departments
Search
Command Palette
Notifications
Attendance
Leave
Requests
Approvals
Knowledge
Audit
```

---

# 89. VERSION 1

Add:

```text
Projects
Tasks
Documents
IT
Helpdesk
Assets
Analytics
Performance
Expenses
Calendar
Announcements
Access Reviews
Temporary Access
```

---

# 90. VERSION 2

Add:

```text
AI Assistant
AI Search
AI Knowledge
AI Summaries
Workflow Builder
Automation
Executive Intelligence
```

---

# 91. VERSION 3

Add:

```text
AI Agents
Knowledge Graph
Skills Graph
Autonomous Workflows
Resource Management
Workplace Management
Advanced Organization Intelligence
```

---

# 92. ROLE DASHBOARD SUMMARY

## Employee
Own work + own data + authorized company content.

## Manager
Team information + team work + team approvals + team analytics.

## HR
Authorized employee lifecycle + HR workflows + sensitive HR data according to policy.

## CEO
Company-wide business information + executive workflows + explicitly granted sensitive access.

## Super Admin
Full platform authority, not merely "all business data forever."

---

# 93. DEFENSE-IN-DEPTH AUTHORIZATION

Every sensitive access should be checked at multiple layers:

```text
UI Permission Gate
      +
API Authorization
      +
Domain Authorization
      +
Database/Data Scope
      +
Storage Permission
```

AI should use the same authorization engine.

---

# 94. ADMIN CONTROL CENTER

The Admin Center should eventually contain:

```text
Overview
Users
Organizations
Departments
Teams
Roles
Permissions
Access Requests
Temporary Access
Access Reviews
Integrations
Workflows
Notifications
Feature Flags
Audit Logs
Security
Sessions
System Health
Data Management
Backups
```

---

# 95. EXECUTIVE CONTROL CENTER

CEO should get:

```text
Company Health
People
Projects
Operations
Finance
Risks
Strategic Goals
Reports
Decisions
Alerts
```

---

# 96. PERSONALIZATION

Allow:
- dashboard widgets
- favorites
- saved views
- saved searches
- notification preferences
- theme
- default filters

Keep personalization constrained so the product remains recognizable and predictable.

---

# 97. GLOBAL DEEP LINKS

Every core resource gets a stable URL:

```text
/people/[id]
/teams/[id]
/projects/[id]
/tasks/[id]
/requests/[id]
/documents/[id]
/tickets/[id]
/knowledge/[id]
/reports/[id]
```

Use those URLs for:
- notifications
- search
- AI
- email
- dashboards

---

# 98. PRODUCT ANALYTICS

Measure:
- active users
- feature adoption
- search usage
- task completion
- request completion
- approval latency
- workflow failures
- AI usage
- error rate
- performance

Do not build invasive employee surveillance.

---

# 99. DOCUMENT + AI KNOWLEDGE

For uploaded documents:

```text
Upload
 ↓
Storage
 ↓
Extract/OCR
 ↓
Chunk
 ↓
Embed
 ↓
pgvector
 ↓
Search Index
```

Always enforce permissions before:
- retrieval
- preview
- download
- AI use

---

# 100. ADVANCED ENTERPRISE SUGGESTIONS

Consider adding when the foundation is stable:

## Governance
- access certification
- sensitive-data classification
- retention policies
- legal hold support if needed
- approval matrices

## Productivity
- universal command center
- smart defaults
- contextual shortcuts
- saved workflows
- personal daily brief

## Management
- team health
- bottleneck detection
- anomaly alerts
- decision center
- executive brief

## Knowledge
- article owners
- content expiry
- policy acknowledgements
- knowledge freshness
- source tracking

## Security
- privileged-action step-up auth
- break-glass
- export control
- session control
- suspicious activity alerts

## AI
- permission-aware assistant
- workflow assistant
- executive summary
- proactive recommendations
- action suggestions
- AI agents

---


# 100A. NEW FEATURE — MULTI-TENANT CHECK

Before implementing any new feature, explicitly answer:

```text
Is it platform-level?
Is it tenant-level?
Is it user-level?
Is it global or tenant-scoped?
Does it require tenant configuration?
Does it need tenant-specific permissions?
Does it create tenant-specific data?
Does it affect search?
Does it affect AI?
Does it affect background jobs?
Does it affect caching?
Does it affect exports?
```

If the feature creates or reads customer data, tenant isolation must be designed before implementation.


# 101. AGENT DECISION TREE FOR ANY NEW FEATURE

Before implementing:

```text
Does an existing open-source service solve this?
        |
        YES → Integrate it
        |
        NO
        ↓
Does an existing open-source library solve it?
        |
        YES → Use the library
        |
        NO
        ↓
Is this company-specific product logic?
        |
        YES → Build it
        |
        NO
        ↓
Stop and reassess.
```

Do not invent custom infrastructure without a reason.

---

# 102. AGENT WORKFLOW

For every task:

```text
1. Read task
2. Inspect repository
3. Inspect related domain
4. Inspect tests
5. Check blueprint
6. Check existing libraries/services
7. Define safe implementation plan
8. Estimate data/migration impact internally
9. Implement
10. Test
11. Security review
12. Performance review
13. UX review
14. Update docs
15. Summarize
```

---

# 103. WHEN REQUIREMENTS ARE AMBIGUOUS

Do not randomly guess.

If a safe interpretation exists:
- choose the least risky reasonable interpretation
- document the assumption
- proceed

If ambiguity can cause:
- data loss
- security risk
- major architecture change

then stop that specific destructive action and surface the ambiguity clearly.

Do not hide risky assumptions.

---

# 104. CODE QUALITY

Prefer:
- small focused functions
- strict typing
- domain boundaries
- reusable components
- predictable data flows
- deterministic business logic
- tests
- explicit dependencies

Avoid:
- giant files
- duplicated logic
- magic strings
- hidden global state
- business logic in JSX
- vendor SDKs everywhere
- speculative abstractions

---

# 105. NO PREMATURE COMPLEXITY

Do not introduce:
- microservices
- Kubernetes
- Kafka
- service mesh
- graph DB
- distributed caches
- generic workflow DSLs

unless actual requirements justify them.

Start with:

```text
Modular Monolith
+
Specialized Open-Source Services
```

---

# 106. FEATURE COMPLETION CHECKLIST

Before declaring a feature complete:

```text
[ ] Product behavior
[ ] UI
[ ] Loading state
[ ] Empty state
[ ] Error state
[ ] Responsive design
[ ] Accessibility
[ ] API
[ ] Backend authorization
[ ] Database
[ ] Validation
[ ] Audit requirements
[ ] Tests
[ ] Observability
[ ] Security review
[ ] Performance review
[ ] Documentation
[ ] Migration safety
```

---

# 107. RELEASE CHECKLIST

```text
[ ] Tests pass
[ ] Typecheck passes
[ ] Lint passes
[ ] Security scan passes
[ ] Migration verified
[ ] Backup verified
[ ] Rollback plan exists
[ ] Monitoring exists
[ ] Health checks exist
[ ] Integrations verified
[ ] Permission checks verified
[ ] Audit verified
[ ] Responsive verified
[ ] Accessibility reviewed
[ ] Feature flag configured
```

---


# 107A. MULTI-TENANT STATUS REQUIREMENT

For tenant-sensitive changes, the status report must also state:

## Tenant Isolation
- how tenant context is resolved
- how tenant scope is enforced
- whether cross-tenant tests were added
- whether cache/queue/search/AI boundaries were reviewed

Never state tenant safety as verified unless actually tested.


# 108. AGENT STATUS REPORT FORMAT

After meaningful work, report:

## What changed
Concise summary.

## Why
Reasoning based on repository/product requirements.

## Files changed
Important files only.

## Architecture impact
What boundaries/integrations changed.

## Tests
Exactly what was run.

## Security
Authorization/security checks.

## Migration
Whether data/schema migration was required.

## Remaining risks
Real risks only.

## Next step
One clear next implementation step.

Never claim:
- tests passed
- security reviewed
- migration safe
- production ready

unless actually verified.

---

# 109. PRODUCTION-READY STANDARD

Production readiness means:

```text
Secure
+
Auditable
+
Recoverable
+
Observable
+
Tested
+
Performant
+
Accessible
+
Permission-aware
+
Migration-safe
+
Maintainable
```

---

# 110. FINAL ARCHITECTURE

```text
                           USERS
                             |
       +---------------------+---------------------+
       |                     |                     |
    EMPLOYEE              MANAGER              CEO
       |                     |                     |
       +---------------------+---------------------+
                             |
                   COMPANY OS FRONTEND
                             |
                     Next.js + React
                             |
                    Unified Experience
                             |
                       NestJS API/BFF
                             |
       +---------------------+---------------------+
       |                     |                     |
   PostgreSQL            Redis/BullMQ         Meilisearch
       |
       +---------------------+---------------------+
                             |
                     Integration Layer
                             |
      +----------+-----------+---------+-----------+
      |          |                     |           |
   Keycloak    Frappe HR         OpenProject      GLPI
   Identity      HR                Work           IT
      |          |                     |           |
      +----------+---------------------+-----------+
                             |
            Documents / BI / Workflow / AI
                             |
      +-----------+----------+-----------+---------+
      |           |          |           |         |
    MinIO     Paperless   Metabase   Temporal     Wiki
   Storage     Docs         BI       Workflow   Knowledge
                             |
                            AI
                             |
                   LangGraph + AI SDK
                             |
                          pgvector
```

---

# 111. FINAL BUILD ORDER

```text
AUDIT EXISTING PORTAL
        ↓
DEFINE DOMAINS
        ↓
DEFINE DATA OWNERSHIP
        ↓
DESIGN SYSTEM
        ↓
KEYCLOAK
        ↓
RBAC + ABAC
        ↓
ADMIN + PERMISSION CENTER
        ↓
POSTGRESQL + DRIZZLE
        ↓
AUDIT + OBSERVABILITY
        ↓
COMPANY OS SHELL
        ↓
PEOPLE
        ↓
SEARCH + COMMAND CENTER
        ↓
NOTIFICATIONS
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

# 112. FINAL AGENT MISSION

Always remember:

> **The objective is not to write the maximum amount of code.**

The objective is to create the maximum product value with:

- minimum unnecessary code
- minimum duplicated infrastructure
- maximum safety
- maximum maintainability
- maximum usability
- maximum security
- maximum leverage from proven open-source software

The final user experience must be:

> **One company. One workplace. One portal.**

The final architecture must be:

> **Modular, secure, observable, replaceable, scalable, open-source-first, and data-safe.**

