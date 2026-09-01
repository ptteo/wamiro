
# WAMIRO — MASTER ORCHESTRATOR
## Enterprise Company OS Research → Architecture → Productization → Implementation → Verification

**Mission:** Turn the existing Wamiro MVP into a commercially credible, multi-tenant Company Operating System capable of serving 100+ customer organizations while remaining open-source-first, self-hostable, secure, performant, maintainable and genuinely useful.

---

# 1. NON-NEGOTIABLES

The agent team must treat the following as product laws:

1. **Wamiro is the product.** External systems are domain engines behind Wamiro.
2. **One company can have many users, roles, departments and scopes.**
3. **One human can belong to multiple companies/tenants.**
4. **The same human may hold different roles in different companies.**
5. **The same human may hold different roles in different departments/teams of the same company.**
6. **Role visibility must be obvious in the UI.**
7. **Permissions must be enforced server-side.**
8. **Tenant isolation must be enforced server-side/data-layer, not only in the UI.**
9. **No paid/trial SaaS dependency is allowed for core functionality.**
10. **Prefer self-hosted open-source software with replaceable adapters.**
11. **Do not rebuild commodity systems unnecessarily.**
12. **Do not destroy working functionality during redesign.**
13. **Do not call a screen complete because it looks good; prove the workflow.**
14. **Do not call a feature complete because one happy-path test works; test failure, permissions, data integrity and concurrency.**
15. **Use the Wamiro/Frappe-inspired visual system already established by D1–D15.**
16. **No gradients, generic AI-dashboard styling, or independent visual language per module.**
17. **Every workspace must use Rail → contextual Sidebar → Page architecture.**
18. **Every major action must have an auditable server-side outcome.**
19. **Every external dependency must have a documented license, version, role and replacement strategy.**
20. **Anything not yet verified is marked UNVERIFIED, never "done".**

---

# 2. CURRENT CRITICAL PRODUCT GAP

The most important issue reported by the product owner is:

```text
CEO login
HR login
Manager login
Employee login
        ↓
all appear substantially the same
```

This means Wamiro currently has a **role-model problem and/or role-experience problem**, not merely a visual problem.

The team must solve both:

```text
AUTHORIZATION
+
IDENTITY CONTEXT
+
ROLE EXPERIENCE
+
WORKSPACE PERSONALIZATION
```

A user must immediately know:

```text
Which company am I in?
Which workspace am I in?
Who am I in this company?
What role am I acting as?
Which department/team am I operating within?
What can I see?
What can I do?
```

---

# 3. PRODUCT NORTH STAR

Wamiro is:

> **The company's single digital workplace and operating layer.**

The user should experience:

```text
One login
One company context
One home
One Rail
One contextual Sidebar
One global search
One command system
One employee identity
One employee profile
One notification center
One work center
One request center
One approval center
One knowledge system
One document experience
One workflow system
One AI layer
One analytics layer
One administration system
```

The user should not feel:

```text
"Now I am inside Frappe HR."
"Now I am inside Zammad."
"Now I am inside OpenProject."
```

Instead:

```text
"My Attendance"
"My Tasks"
"My Support Requests"
"My Documents"
```

---

# 4. AGENT TEAM

Run the team in dependency order.

## Agent 00 — Master Orchestrator

Owns:

```text
scope
dependencies
research synthesis
conflict resolution
priority
acceptance criteria
final blueprint
```

Never implements before the relevant research/architecture decision exists.

---

## Agent 01 — Current-State Forensics

Audit the actual Wamiro repository.

Produce:

```text
routes
screens
components
API endpoints
database entities
auth model
role model
tenant model
integrations
feature flags
unfinished features
dead code
duplicated logic
performance bottlenecks
security risks
```

Especially test:

```text
CEO
HR
Manager
Employee
Admin
```

and document what actually changes between accounts.

---

## Agent 02 — Competitor Intelligence

Research and compare:

```text
Microsoft Viva
Workvivo
Staffbase
LumApps
Simpplr
Unily
Interact
Jostle
SharePoint/Viva ecosystem
Rippling
BambooHR
HiBob
Personio
Odoo
ERPNext
Frappe HR
OpenProject
GLPI
Zammad
```

Research:

```text
information architecture
role personalization
onboarding
employee journeys
search
knowledge
workflow
AI
analytics
admin
mobile
communications
integrations
customer onboarding
enterprise governance
```

Output:

```text
What they do
Why users like it
What Wamiro should learn
What Wamiro should not copy
Gaps Wamiro can exploit
```

---

## Agent 03 — Open-Source Provider Intelligence

Find mature free/self-hosted providers.

For each:

```text
Repository
License
Commercial constraints
Self-hosted status
Feature coverage
API
Webhook
Authentication
Maintenance health
Scalability
Deployment complexity
Replacement difficulty
```

No "free trial" products.

No "free tier" products.

Only genuinely usable free/open-source/self-hosted software qualifies for the preferred architecture.

---

## Agent 04 — Multi-Tenant Architect

Design:

```text
tenant
organization
workspace
user
membership
role
department
team
scope
module
entitlement
configuration
```

Must support:

```text
one person → many companies
one person → different roles per company
one company → one person with multiple scoped roles
department-scoped permissions
temporary permissions
acting context
```

---

## Agent 05 — Identity / Access Architect

Design:

```text
authentication
sessions
MFA
SSO
SCIM/federation where applicable
RBAC
ABAC
resource permissions
field-level permissions
temporary access
delegation
break-glass
session revocation
```

Define permission precedence precisely.

---

## Agent 06 — Role Experience / UX Architect

Design distinct experiences for:

```text
Employee
Manager
Department Admin
HR Admin
Finance
IT
Executive/CEO
Compliance
Platform Admin
Tenant Super Admin
Custom Roles
```

Define:

```text
home
Rail
Sidebar
widgets
quick actions
search
commands
notifications
analytics
data visibility
```

---

## Agent 07 — Department / Organization Architect

Design:

```text
legal entity
organization
business unit
department
team
location
region
manager hierarchy
matrix organizations
cross-functional teams
```

Handle:

```text
one employee → multiple teams
temporary team
acting manager
dotted-line manager
department transfer
promotion
reassignment
```

---

## Agent 08 — Employee Lifecycle Architect

Research and model:

```text
candidate
applicant
offer
hire
preboarding
onboarding
active employee
leave
transfer
promotion
performance
training
offboarding
alumni
```

---

## Agent 09 — Work / Productivity Architect

Research:

```text
tasks
projects
goals
OKRs
workload
calendar
meetings
time
dependencies
portfolio
resource allocation
```

Decide what belongs in Wamiro and what should remain powered by OpenProject or another provider.

---

## Agent 10 — Knowledge / Documents / Search Architect

Design:

```text
knowledge
wiki
policies
documents
permissions
versioning
taxonomy
metadata
search
federated search
semantic search
AI retrieval
content lifecycle
```

Prevent stale knowledge.

---

## Agent 11 — Workflow / Automation Architect

Design one orchestration layer for:

```text
requests
approvals
HR
finance
IT
documents
governance
onboarding
offboarding
facilities
```

Support:

```text
conditions
branches
parallel approvals
delegation
SLAs
escalation
retries
timeouts
compensation
idempotency
audit
```

---

## Agent 12 — IT / Support / Assets Architect

Research:

```text
ITSM
helpdesk
assets
software inventory
devices
service catalog
incidents
problems
changes
SLA
```

Use GLPI/Zammad or equivalent through adapters where appropriate.

---

## Agent 13 — Finance / Procurement Architect

Research:

```text
expenses
reimbursements
purchases
vendors
budgets
procurement
travel
financial approvals
```

Prefer free/self-hosted engines such as ERPNext/Frappe capabilities where license architecture permits.

---

## Agent 14 — Workplace / Facilities Architect

Research:

```text
calendar
rooms
desks
resources
visitors
facilities requests
events
locations
```

---

## Agent 15 — Communications / Collaboration Architect

Research:

```text
announcements
company news
department news
feed
comments
mentions
recognition
surveys
chat
communities
events
```

Decide whether Matrix/Synapse or another open-source service should power chat.

---

## Agent 16 — Analytics / Executive Intelligence Architect

Design different information needs:

```text
Employee
Manager
Department Head
CEO
HR
Finance
Admin
```

Focus on:

```text
What happened?
Why?
What changed?
What is at risk?
What decision is required?
```

---

## Agent 17 — AI / Agentic Workflow Architect

Design:

```text
permission-aware AI
RAG
tool use
context
citations
AI actions
action previews
AI agents
memory
evaluation
guardrails
audit
```

AI must use the same authorization boundary as the portal.

---

## Agent 18 — Security / Privacy / Compliance Architect

Threat-model:

```text
IDOR
privilege escalation
cross-tenant leakage
data export
file access
search leakage
AI leakage
session hijacking
CSRF/XSS
SSRF
webhook abuse
secret leakage
logging leakage
```

Produce release-blocking checks.

---

## Agent 19 — Performance / Reliability Architect

Measure:

```text
p50
p95
p99
TTFB
navigation
workspace switch
search
table render
API latency
DB latency
job latency
```

Design:

```text
caching
indexes
queues
pagination
virtualization
lazy loading
backpressure
idempotency
retries
```

---

## Agent 20 — Mobile / Accessibility / Internationalization Architect

Test:

```text
desktop
tablet
mobile
keyboard
screen reader
RTL
long translations
timezone
locale
currency
date/time
```

Target:

```text
WCAG 2.2 AA
```

---

## Agent 21 — Product / Commercialization Architect

Research what makes an enterprise product sellable:

```text
tenant onboarding
demo
trial architecture if later needed
self-service configuration
documentation
security posture
migration
implementation
support
pricing architecture
packaging
enterprise controls
```

Do not require paid services for the product to function internally/self-hosted.

---

## Agent 22 — QA / Scenario / Chaos Architect

Build:

```text
role tests
tenant tests
workflow tests
failure tests
concurrency tests
browser tests
mobile tests
data migration tests
integration contract tests
```

Generate the 100-company scenario matrix.

---

## Agent 23 — Technical Debt / Code Health Architect

Audit:

```text
duplicated components
duplicated services
dead code
naming
dependency duplication
API inconsistencies
schema problems
business logic leakage
frontend auth assumptions
```

---

## Agent 24 — Synthesis + Implementation Planner

Consumes every agent report.

Produces:

```text
final architecture
gap register
implementation backlog
dependency graph
migration plan
acceptance criteria
release gates
```

This agent never invents unsupported facts.

---

# 5. EXECUTION ORDER

```text
WAVE 0
Agent 01
Agent 02
Agent 03

WAVE 1
Agent 04
Agent 05
Agent 06
Agent 07

WAVE 2
Agent 08
Agent 09
Agent 10
Agent 11

WAVE 3
Agent 12
Agent 13
Agent 14
Agent 15
Agent 16

WAVE 4
Agent 17
Agent 18
Agent 19
Agent 20

WAVE 5
Agent 21
Agent 22
Agent 23

WAVE 6
Agent 24

WAVE 7
Implementation agents execute the accepted backlog

WAVE 8
QA agents re-run the entire matrix

WAVE 9
Release gate
```

No later wave should invalidate an architecture decision without explicitly raising a decision record.

---

# 6. AGENT OUTPUT CONTRACT

Every research agent must return:

```text
1. Executive summary
2. Current-state findings
3. Competitor evidence
4. Recommended product behavior
5. Open-source provider recommendations
6. What Wamiro should build
7. What Wamiro should integrate
8. What Wamiro should not build
9. Edge cases
10. Security concerns
11. Performance concerns
12. UX implications
13. Data model implications
14. API/integration implications
15. Testing requirements
16. Open questions
17. Priority
```

Priority:

```text
P0 = release blocker
P1 = must-have
P2 = important
P3 = later
```

---

# 7. RESEARCH STANDARD

Research must use:

```text
official product documentation
official repositories
official release notes
official API documentation
credible enterprise comparisons
current product pages
real-world UX patterns
```

Prefer primary sources.

Do not treat vendor marketing claims as independently verified facts.

---

# 8. COMPETITIVE INSIGHT CURRENTLY VERIFIED

Current research shows that major employee-experience platforms are moving toward a combination of:

```text
personalized employee hub
enterprise search
knowledge
workflow/action
AI
employee journeys
communications
analytics
integrations
mobile/frontline reach
```

Microsoft Viva Connections provides a personalized gateway with organization resources, communications and targeted content; Viva Engage provides communities and knowledge sharing. citeturn581899search0turn581899search4

Workvivo's current product direction combines AI search/answers, AI actions, journeys, knowledge hubs, chat/calls, custom widgets and people intelligence. citeturn158851search0turn158851search2turn158851search4

Staffbase emphasizes personalized pages, employee journeys, AI answers, search across business systems, governance, analytics and multi-channel delivery. citeturn192581search0turn192581search4

LumApps emphasizes an AI Employee Hub, role-aware agents, workflows/micro-apps, knowledge and completing everyday actions without leaving the hub. citeturn192581search1turn192581search2

Simpplr emphasizes permission-aware enterprise search, AI answers, AI agents, custom apps/connectors and content governance. citeturn192581search3turn192581search8

**Strategic implication:** Wamiro should compete as a **company operating layer** rather than as "another HR portal." The moat is unified identity/context + role-aware navigation + cross-system action + governance + open-source/self-hostable architecture.

---

# 9. IMMEDIATE PRODUCT CORRECTION

The current role problem must be treated as P0.

After login, the shell must visibly communicate:

```text
Company:
Acme Technologies

Current user:
Rahul Sharma

Current role:
Manager

Current scope:
Engineering · Platform Team

Current workspace:
People
```

The UI should expose this without overwhelming the user.

Recommended placement:

```text
Tenant/company identity
+
user avatar/name
+
role/scope indicator
```

in the shell/profile context.

---

# 10. DO NOT MODEL ROLE AS A PROPERTY OF THE USER

Incorrect:

```text
user.role = "CEO"
```

Correct:

```text
user
   ↓
organization_membership
   ↓
role_assignment
   ↓
scope
```

Example:

```text
User: Rahul

Company A:
  CEO

Company B:
  Employee

Company B / Finance:
  Finance Reviewer

Company B / Engineering:
  Team Lead
```

The same human identity can legally exist in multiple company contexts.

---

# 11. ACTIVE ORGANIZATION CONTEXT

The user must be able to see:

```text
Active organization
```

If a user belongs to more than one organization:

```text
Company A ▼
```

opens:

```text
Your organizations

Acme Technologies
Deep Systems
Northstar Labs
```

Switching organization must:

```text
invalidate stale authorization context
refresh tenant configuration
refresh navigation
refresh permissions
refresh data
refresh search scope
refresh AI context
```

Never retain data from the previous tenant in the new tenant's UI.

---

# 12. ACTIVE ROLE CONTEXT

If a user has several legitimate roles in one organization, define an explicit model.

Prefer:

```text
effective permissions
```

over a fake manual "switch role" unless business rules truly allow role assumption.

If a user is a:

```text
Manager + Finance Reviewer
```

the UI can communicate:

```text
Manager · Finance Reviewer
```

and show the combined effective experience.

For genuine context switching:

```text
Acting as:
Manager
```

must be audited and restricted.

---

# 13. DEPARTMENT-SCOPED EXPERIENCE

Example:

```text
Acme Technologies
Engineering
Platform Team
Manager
```

The same role name may have different scope:

```text
Manager / Engineering
Manager / Sales
```

The permission engine must distinguish these.

---

# 14. ROLE-BASED HOME

The first screen must differ materially by role.

Employee:

```text
My work
My approvals
My meetings
My requests
Announcements
Personal actions
```

Manager:

```text
Team health
Team work
Approvals
Risks
People
Team analytics
```

HR:

```text
Employee lifecycle
Pending HR actions
Recruitment
Attendance/leave
HR analytics
Policies
```

CEO:

```text
Company health
Decisions
Risks
Strategic progress
Workforce
Business trends
```

Admin:

```text
Security
Users
Access
Modules
Integrations
Health
Audit
```

The exact data must remain permission-driven.

---

# 15. ROLE-BASED RAIL

The Rail should not necessarily have identical visible workspaces for every role.

Example:

Employee:

```text
Home
People
Work
Requests
Knowledge
Documents
Support
```

Manager:

```text
Home
People
Work
Requests
Knowledge
Documents
Support
Analytics
```

HR:

```text
Home
People
Requests
Knowledge
Documents
Analytics
Administration where authorized
```

CEO:

```text
Home
People
Work
Requests
Knowledge
Analytics
AI
```

Admin:

```text
Home
People
Requests
Documents
Support
Analytics
Administration
```

Only show workspaces that are both:

```text
enabled for tenant
AND
authorized for user
```

---

# 16. ROLE CONTEXTUAL SIDEBAR

After selecting a workspace, the Sidebar must be filtered by:

```text
workspace
+
tenant modules
+
role
+
scope
+
feature flags
```

This is the key correction to the current "every account looks the same" problem.

---

# 17. PERSONAL USER CONFIGURATION

Each user needs tenant-scoped preferences:

```text
theme
language
timezone
date format
density
default workspace
default landing page
pinned workspaces
sidebar state
saved views
dashboard layout
notification preferences
email preferences
push preferences
keyboard shortcuts
accessibility preferences
recent items
favorites
```

Separate:

```text
global identity preferences
```

from:

```text
tenant-specific preferences
```

Example:

```text
User globally:
  prefers dark mode

Company A:
  default workspace = Work

Company B:
  default workspace = People
```

---

# 18. USER CONFIGURATION PRECEDENCE

Use:

```text
System default
↓
Tenant default
↓
Role default
↓
User preference
```

where applicable.

Security policies always override personal preference.

---

# 19. COMPANY REGISTRATION FLOW

Canonical:

```text
Create account
↓
Create organization
↓
Verify identity
↓
Company details
↓
Industry
↓
Country
↓
Timezone
↓
Logo
↓
Choose modules
↓
Create initial organization administrator
↓
Configure organization
↓
Invite users
↓
Configure roles
↓
Configure integrations
↓
Security setup
↓
Finish
```

---

# 20. INITIAL ORGANIZATION CREATION

Create:

```text
organization
tenant configuration
initial administrator
default roles
default permissions
default modules
default navigation
default notification policies
default workflow templates
default settings
```

All operations must be transactional or safely recoverable.

---

# 21. INVITATION FLOW

```text
Admin invites user
↓
Invitation created
↓
Email/message
↓
User accepts
↓
Identity created/linked
↓
Tenant membership created
↓
Role assigned
↓
Department/team scope assigned
↓
Initial preferences
↓
First login
```

Do not assume email = unique global company identity.

A person may already exist in Wamiro.

---

# 22. SAME FOUNDER / CEO EDGE CASE

Support:

```text
Alice
```

belonging to:

```text
Company A → Founder/CEO
Company B → CEO
Company C → Advisor
Company D → Employee
```

This is not an error.

The UI must show the active company and role at all times.

---

# 23. SAME PERSON ACROSS DEPARTMENTS

Support:

```text
Alice
Engineering → Team Lead
Security → Reviewer
Company-wide → Executive
```

Permissions should be evaluated per resource/scope.

---

# 24. EMPLOYEE TRANSFER

When:

```text
Engineering
→ Product
```

must trigger:

```text
role/scope review
permissions review
workflow assignment review
manager update
dashboard recalculation
notification
audit
```

Do not leave stale department permissions.

---

# 25. PROMOTION

Promotion:

```text
Employee
→ Manager
```

must update:

```text
role
scope
navigation
home
permissions
approvals
team visibility
analytics
```

without creating a new user account.

---

# 26. MANAGER CHANGE

Changing manager must update:

```text
team scope
approval routing
1:1 relationships
team analytics
workload visibility
leave approvals where configured
```

The previous manager must lose access if the policy requires it.

---

# 27. TEMPORARY ASSIGNMENT

Support:

```text
Acting manager
Interim department admin
Temporary reviewer
Project-specific manager
```

with:

```text
start
expiry
reason
scope
audit
```

---

# 28. DELEGATION

Users may delegate eligible approval responsibilities:

```text
Owner
Delegate
Start
End
Reason
```

Delegation should never create permanent role elevation.

---

# 29. LEAVE / ABSENCE

If an approver is unavailable:

```text
workflow
↓
delegation/fallback
↓
alternate approver
```

No approvals should become permanently stuck.

---

# 30. MULTI-LEGAL-ENTITY

Large customers may contain:

```text
Company
├── Legal Entity A
├── Legal Entity B
└── Legal Entity C
```

Employees can belong to the correct legal entity.

Financial, payroll, compliance and reporting scope can differ by entity.

---

# 31. LOCATION / REGION

Support:

```text
Global
Region
Country
Office
Department
Team
```

where relevant.

Do not hard-code a single-country organization.

---

# 32. MODULE ENTITLEMENT MODEL

Separate:

```text
module enabled
```

from:

```text
user authorized
```

Example:

```text
Finance
enabled for tenant
```

does not mean:

```text
every employee can access Finance administration
```

---

# 33. PLATFORM VS TENANT ADMINISTRATION

Two separate concepts:

### Platform Admin

Controls:

```text
all tenants
platform health
platform configuration
release
global feature flags
support/break-glass
```

### Tenant Admin

Controls:

```text
their organization
their users
their roles
their modules
their workflows
their integrations
their branding
their policies
```

Platform operators should not casually read tenant business data.

---

# 34. CUSTOMER DATA ISOLATION

Tenant-scoped:

```text
users
employees
departments
teams
roles
permissions
documents
requests
workflows
analytics
search
AI context
notifications
integrations
audit
configuration
```

Tenant resolution must occur server-side.

---

# 35. SEARCH ARCHITECTURE

Global search:

```text
query
↓
tenant scope
↓
authorization scope
↓
content source
↓
ranking
↓
results
```

Do not search first and filter later.

---

# 36. AI ARCHITECTURE

AI:

```text
User
↓
Active tenant
↓
Active role/scope
↓
Authorization
↓
Tool selection
↓
Authorized data
↓
Model
↓
Answer/action
```

Never:

```text
AI
→ arbitrary SQL
→ unrestricted vector store
```

---

# 37. HOME EXPERIENCE

Home is not a static dashboard.

It is:

```text
role-aware
tenant-aware
module-aware
permission-aware
time-aware
```

User should see:

```text
What matters now
What I need to do
What changed
What needs attention
```

---

# 38. PERSONALIZATION WITHOUT CHAOS

Allow:

```text
pin workspace
reorder favorites
save views
hide nonessential items
dashboard layout
```

Do not allow users to dismantle the product's core information architecture.

---

# 39. COMPANY CONFIGURATION

Tenant admins can configure:

```text
branding
modules
roles
permissions
departments
teams
locations
workflows
notification rules
policies
integrations
custom fields
custom views
```

---

# 40. EDGE CASE REGISTER

Agents must explicitly test:

```text
user has no department
user has multiple departments
user has no manager
manager has no team
CEO also has admin role
HR is also manager
one person belongs to two companies
user invited twice
email already linked to another tenant
user suspended during active session
role removed while logged in
department changed while logged in
module disabled while user is inside it
integration goes offline
workflow approver deleted
approver goes on leave
document permission revoked after link generation
search index stale
AI retrieval stale
duplicate webhook
duplicate event
event arrives out of order
concurrent approvals
double submission
network interruption during save
browser back after permission change
tenant switch during in-flight request
expired temporary access
expired invitation
expired password/session
```

---

# 41. EVENT ARCHITECTURE

Use domain events such as:

```text
organization.created
organization.updated

membership.created
membership.updated
membership.suspended

role.assigned
role.revoked

employee.created
employee.updated
employee.transferred
employee.promoted

department.created
team.created

request.created
request.approved
request.rejected

workflow.started
workflow.completed
workflow.failed

document.uploaded
document.shared
document.permission_changed

notification.created

integration.connected
integration.failed
integration.reconciled
```

Consumers:

```text
notifications
audit
search
analytics
AI indexing
integrations
```

---

# 42. RELIABILITY MODEL

Every external integration must have:

```text
health
last_sync
error state
retry policy
reconciliation
manual retry
```

Never assume an external system is always online.

---

# 43. IDempotency

Require idempotency for operations such as:

```text
payments
expense submission
purchase creation
workflow execution
webhooks
provisioning
notifications
integration sync
```

---

# 44. WORKFLOW RELIABILITY

Workflows require:

```text
retry
timeout
compensation
idempotency
dead-letter handling
manual recovery
audit
```

Long-running workflows must not depend on a browser staying open.

---

# 45. DATA INTEGRITY

For every critical mutation:

```text
validate
authorize
transaction
persist
emit event
audit
```

Never emit "success" before durable success.

---

# 46. PERFORMANCE TARGETS

Define budgets before optimization:

```text
initial shell: fast perceived response
workspace switch: near-instant shell transition
search interaction: responsive
common reads: low p95 latency
critical writes: predictable p95
```

Use actual production measurements to finalize numeric thresholds.

---

# 47. LARGE CUSTOMER TARGET

Simulate:

```text
100 tenants
10,000 tenants as architecture stress case
100,000 users
millions of records
large documents
large audit logs
large search index
```

100 customer organizations is the commercial target.

10,000 tenants is an architectural stress test, not a launch promise.

---

# 48. TESTING PYRAMID

Use:

```text
Unit
↓
Integration
↓
Contract
↓
E2E
↓
Security
↓
Load
↓
Chaos/failure
```

Prioritize:

```text
auth
authorization
tenant isolation
critical workflows
data mutations
integrations
exports
files
AI
```

---

# 49. ROLE E2E TESTS

At minimum:

```text
Employee
Manager
Department Admin
HR Admin
Finance
IT
CEO
Tenant Super Admin
Platform Admin
Custom Role
```

For each:

```text
login
home
Rail
Sidebar
search
command palette
one critical workflow
restricted action
logout
```

---

# 50. COMPANY E2E TESTS

Create simulated:

```text
Company A — 10 employees
Company B — 100 employees
Company C — 1,000 employees
Company D — multi-department
Company E — multi-location
Company F — multi-legal-entity
Company G — multiple modules
Company H — minimal modules
Company I — custom roles
Company J — heavy integrations
```

Expand this to 100 tenant scenarios in the test matrix.

---

# 51. RELEASE GATES

P0 blockers:

```text
cross-tenant data leak
authorization bypass
critical data loss
broken login
broken session security
broken approval that causes financial/HR corruption
document leakage
AI permission bypass
unrecoverable migration
```

No production release while a P0 exists.

---

# 52. SALES / COMMERCIAL READINESS

Wamiro is not sellable merely because every module exists.

A customer needs:

```text
clear product value
clear onboarding
clear roles
clear permissions
clear deployment
clear documentation
clear security posture
clear demo
clear integrations
clear migration story
clear support process
```

---

# 53. PRODUCT PACKAGING

Keep the product architecture ready for later:

```text
plan
enabled modules
limits
usage
subscription
billing state
```

But do not make paid billing a dependency for the open-source/self-hosted product.

---

# 54. FREE/OPEN-SOURCE RULE

For core product operation:

```text
No required paid API
No required free-tier API
No required trial
No required proprietary SaaS
```

Preferred:

```text
self-hosted
open source
free
API accessible
replaceable
```

---

# 55. LICENSE RULE

"Open source" does not automatically mean "safe for any commercial architecture."

Every provider must have:

```text
package
version
license
source
deployment model
integration model
commercial implications
```

Use external-service/API boundaries where necessary and obtain proper legal review before commercial redistribution or combining copyleft source into proprietary code.

---

# 56. CURRENT OPEN-SOURCE CANDIDATE MAP

Preferred candidates to investigate:

```text
Identity:
Keycloak

HR:
Frappe HR

ERP/Finance/Procurement:
ERPNext

Projects/Work:
OpenProject

ITSM/Assets:
GLPI
Zammad

Documents:
Paperless-ngx
Nextcloud

Knowledge:
Wiki.js
BookStack
Outline — verify current licensing before commercial use

Analytics:
Metabase

Scheduling:
Cal.com — verify current licensing/version

Surveys:
Formbricks

Search:
Meilisearch

Storage:
MinIO

Chat:
Matrix/Synapse or another genuinely free self-hosted solution
```

Do not select a provider only because it appears on a list.

Agent 03 must verify current license and commercial conditions before adoption.

---

# 57. IMPORTANT LICENSE EXAMPLES

The current blueprint correctly warns that open-source licenses differ; for example, the existing research identifies Keycloak as Apache-2.0 and several other ecosystem services as GPL/AGPL-family. fileciteturn4file1L902-L931

Current repository evidence also shows Frappe HR's package metadata lists GPL-3.0. citeturn288989search8

ERPNext's repository metadata likewise lists GPL-3.0. citeturn288989search7

Therefore:

```text
Free to run
≠
safe to embed
≠
safe to modify and redistribute
```

This distinction is mandatory in the provider-selection phase.

---

# 58. CUSTOMER ECONOMICS

The target architecture is:

```text
Customer pays Wamiro
+
Customer can self-host if desired
+
Wamiro does not force expensive infrastructure
+
Core product does not depend on paid third-party APIs
```

The commercial moat should be:

```text
unified experience
integration
orchestration
security
customer configuration
deployment
support
product quality
```

not vendor API resale.

---

# 59. FINAL RESEARCH QUESTIONS

Every agent should help answer:

```text
Why would a 100–1,000 employee company buy Wamiro?
Why would they not just buy Microsoft 365/Viva?
Why would they not buy Workvivo?
Why would they not buy Staffbase/LumApps/Simpplr?
Why would they not use Odoo/ERPNext + separate tools?
Why would they choose self-hosted?
What is the first painful problem Wamiro solves?
What is Wamiro's unique moat?
What can Wamiro do better than the incumbents?
```

---

# 60. FINAL PRODUCT DIFFERENTIATION

The strongest defensible Wamiro direction is:

```text
Open-source-first
+
self-hostable
+
multi-tenant
+
role-aware
+
department-aware
+
unified company shell
+
permission-aware search
+
permission-aware AI
+
cross-system workflows
+
cross-system employee context
+
customer-specific configuration
```

This combines categories that competitors often cover separately.

Current competitive products emphasize personalized hubs, unified knowledge/search, workflows, AI agents, employee journeys and integrations; Wamiro should combine those strengths while differentiating through open-source/self-hostable architecture and deep role/scope orchestration. citeturn581899search0turn158851search0turn192581search0turn192581search2turn192581search3

---

# 61. IMPLEMENTATION PHASES AFTER RESEARCH

Do not jump straight to feature development.

## Phase R0 — Forensics
Inventory actual current Wamiro.

## Phase R1 — Product Strategy
Define exact customer, problem and product moat.

## Phase R2 — Multi-Tenant Identity
Implement organization + membership + role context.

## Phase R3 — Authorization
Implement RBAC + scope + contextual policies.

## Phase R4 — Role Experiences
Separate Employee/Manager/HR/Executive/Admin experiences.

## Phase R5 — Personalization
Implement user preferences and tenant defaults.

## Phase R6 — Unified Platform Services
Search, notifications, audit, events, integrations.

## Phase R7 — Domain Integrations
HR, Work, IT, Documents, Finance, Workplace.

## Phase R8 — Workflow/Automation
One orchestration layer.

## Phase R9 — Knowledge/Search
Trusted content and permission-aware retrieval.

## Phase R10 — AI
Permission-aware contextual AI and actions.

## Phase R11 — Performance/Reliability
Measure, optimize, load-test and harden.

## Phase R12 — 100-Tenant Simulation
Run every role and tenant scenario.

## Phase R13 — Security/Privacy
Final penetration-style review.

## Phase R14 — Customer Readiness
Onboarding, demo, migration, docs, support.

## Phase R15 — Release Candidate
Freeze scope and run release gates.

---

# 62. "100% SUCCESS" DEFINITION

Do not define 100% success as:

```text
Every possible edge case can never happen.
```

Instead define it as:

```text
Every P0/P1 critical workflow has:
automated test
+
integration test
+
E2E test
+
permission test
+
failure test
+
recovery path
```

A release can be marked:

```text
Critical workflows verified
```

only after evidence exists.

---

# 63. FINAL CUSTOMER TEST

A fresh company must be able to:

```text
Register
↓
Create company
↓
Create admin
↓
Configure organization
↓
Enable modules
↓
Create departments
↓
Create teams
↓
Invite users
↓
Assign roles
↓
Assign scopes
↓
Login as each role
↓
See materially different experience
↓
Perform allowed operations
↓
Fail unauthorized operations
↓
Switch organization if applicable
↓
Change role/department
↓
See access update
↓
Search only authorized data
↓
Use AI only against authorized data
↓
Complete workflows
↓
Audit results
```

---

# 64. THE MOST IMPORTANT DEMO

A customer demo should show:

```text
Create Acme
↓
Select HR + Work + IT + Knowledge + Analytics
↓
Invite CEO
↓
Invite HR
↓
Invite Manager
↓
Invite Employee
↓
Employee logs in
→ Employee Home

Manager logs in
→ Manager Home

HR logs in
→ HR Home

CEO logs in
→ Executive Home

Admin logs in
→ Admin Home
```

The visual difference must be obvious but still feel like one product.

---

# 65. ROLE EXPERIENCE ACCEPTANCE CRITERIA

A reviewer should be able to answer instantly:

```text
Who am I?
Which company am I in?
What role am I using?
Which department/team am I scoped to?
What can I do?
What is my next action?
```

If not, the role UX is incomplete.

---

# 66. MASTER PRODUCT DEFINITION OF DONE

Wamiro is considered commercially ready only when:

```text
Multi-tenant isolation verified
Role experiences differentiated
Department scopes work
Personal preferences work
Company onboarding works
Module enablement works
Permissions enforced server-side
Search permission-aware
AI permission-aware
Workflow engine reliable
Integrations replaceable
External systems hidden behind Wamiro UX
Critical data flows auditable
Critical workflows tested
Failure states tested
Mobile usable
Accessibility verified
Performance measured
Backups tested
Restore tested
Customer documentation ready
Demo ready
Migration plan ready
Support process ready
Open-source license review completed
No required paid SaaS dependency
```

---

# 67. IMPLEMENTATION DISCIPLINE

Agents must not say:

```text
Done
```

because:

```text
page exists
```

"Done" requires:

```text
functionality
authorization
tenant isolation
data integrity
loading
error
empty
mobile
accessibility
performance
audit
tests
```

---

# 68. FINAL ORCHESTRATOR RULE

When an agent finds a gap:

```text
DO NOT PATCH RANDOMLY.
```

Instead:

```text
Gap
↓
Classify
↓
Impact
↓
Owner agent
↓
Research
↓
Architecture decision
↓
Implementation plan
↓
Implement
↓
Test
↓
Update blueprint
```

The blueprint must remain synchronized with the implementation.

---

# 69. FINAL FILES TO MAINTAIN

The `/wamiro` project documentation folder must contain:

```text
00_WAMIRO_MASTER_ORCHESTRATOR.md
01_WAMIRO_RESEARCH_AGENT_TEAM.md
02_WAMIRO_END_TO_END_MASTER_BLUEPRINT_V2.md
03_WAMIRO_ROLE_AND_IDENTITY_FLOW_SPEC.md
04_WAMIRO_OPEN_SOURCE_PROVIDER_REGISTRY.md
05_WAMIRO_100_COMPANY_END_TO_END_TEST_MATRIX.md
```

Any future architecture decision must update the relevant file.

---

# 70. FINAL PRINCIPLE

> **Wamiro is not finished when it has many modules. Wamiro is finished when 100 different companies can configure it, 1,000 different role combinations can use it correctly, and users still experience one coherent company operating system.**
