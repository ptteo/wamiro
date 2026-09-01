
# WAMIRO — RESEARCH AGENT TEAM
## Individual Agent Assignment File

This file defines the exact work each research/architecture agent must perform.

---

# AGENT 01 — CURRENT STATE FORENSICS

## Mission
Audit the actual Wamiro implementation.

## Inputs
```text
repository
database schema
routes
API
auth
existing D1–D15 docs
```

## Required output
```text
CURRENT_STATE.md
GAP_REGISTER.md
TECH_DEBT.md
```

## Must test
```text
CEO
HR
Manager
Employee
Admin
```

## Special requirement
Demonstrate exactly why the four current accounts look similar.

---

# AGENT 02 — COMPETITOR RESEARCH

## Research
```text
Microsoft Viva
Workvivo
Staffbase
LumApps
Simpplr
Unily
Interact
Jostle
SharePoint/Viva
Rippling
BambooHR
HiBob
Personio
Odoo
ERPNext
Frappe HR
```

## Compare
```text
role personalization
home
search
journeys
knowledge
workflow
AI
analytics
admin
mobile
communication
integrations
customer onboarding
governance
```

## Deliver
```text
COMPETITOR_MATRIX.md
COMPETITOR_GAPS.md
WAMIRO_DIFFERENTIATORS.md
```

Current research shows leading employee-experience platforms increasingly combine personalized hubs, knowledge/search, journeys/workflows, AI and integrations. citeturn581899search0turn158851search0turn192581search0turn192581search2turn192581search3

---

# AGENT 03 — OPEN-SOURCE PROVIDERS

## Mission
Replace paid SaaS dependencies with free/self-hosted alternatives.

## For every candidate record
```text
name
repo
license
commercial restriction
API
webhooks
self-hosted
maturity
health
replacement difficulty
deployment cost
```

## Candidate families
```text
Keycloak
Frappe HR
ERPNext
OpenProject
GLPI
Zammad
Paperless-ngx
Nextcloud
Wiki.js
BookStack
Metabase
Cal.com
Formbricks
Meilisearch
MinIO
Matrix/Synapse
```

Never classify software as "free" solely because a vendor offers a free tier.

---

# AGENT 04 — MULTI-TENANCY

Design:

```text
Organization
Membership
Role
Scope
Module
Entitlement
Configuration
```

Required scenario:

```text
Alice
Company A → CEO
Company B → Employee
Company C → Advisor
```

---

# AGENT 05 — IAM / AUTHORIZATION

Design:

```text
identity
authentication
session
MFA
SSO
RBAC
ABAC
scope
delegation
temporary access
revocation
break-glass
```

Permission precedence must be deterministic.

---

# AGENT 06 — ROLE EXPERIENCE

Produce a full matrix:

```text
Employee
Manager
Department Admin
HR
Finance
IT
Executive
Tenant Admin
Platform Admin
Custom Role
```

For each:

```text
home
Rail
Sidebar
search
commands
notifications
analytics
actions
restrictions
```

---

# AGENT 07 — ORG/DEPARTMENT MODEL

Support:

```text
legal entities
business units
departments
teams
locations
regions
matrix teams
dotted-line managers
temporary assignments
```

---

# AGENT 08 — EMPLOYEE LIFECYCLE

Research:

```text
candidate
offer
preboarding
onboarding
active
transfer
promotion
performance
training
leave
offboarding
alumni
```

---

# AGENT 09 — WORK

Decide:

```text
what stays in Wamiro
what OpenProject powers
what data Wamiro owns
what data OpenProject owns
how assignments/project context work
```

---

# AGENT 10 — KNOWLEDGE/DOCUMENTS/SEARCH

Design:

```text
taxonomy
ownership
freshness
versioning
access control
search
federated retrieval
AI grounding
```

---

# AGENT 11 — WORKFLOW

Design one engine/interface for:

```text
request
approval
condition
branch
parallel
delegation
SLA
escalation
retry
timeout
audit
```

---

# AGENT 12 — IT/ASSETS

Research:

```text
GLPI
Zammad
service catalog
incident
asset
device
SLA
```

---

# AGENT 13 — FINANCE

Research:

```text
ERPNext
Frappe HR
expenses
purchase
vendor
budget
travel
reimbursement
```

---

# AGENT 14 — WORKPLACE

Research:

```text
calendar
room
desk
resource
visitor
facilities
booking
location
```

---

# AGENT 15 — COMMUNICATION

Research:

```text
Workvivo
Microsoft Viva Engage
Staffbase communities
Matrix/Synapse
announcements
feed
recognition
surveys
chat
```

---

# AGENT 16 — ANALYTICS

Create persona dashboards:

```text
Employee
Manager
Department Head
HR
CEO
Admin
```

Every dashboard must answer:

```text
what happened
what changed
what matters
what needs action
```

---

# AGENT 17 — AI

Design:

```text
RAG
tool use
permission-aware retrieval
citations
action preview
agent permissions
memory
evaluation
guardrails
audit
```

---

# AGENT 18 — SECURITY

Threat model:

```text
IDOR
tenant leakage
privilege escalation
API bypass
search leakage
AI leakage
file leakage
session abuse
webhook abuse
secret leakage
```

---

# AGENT 19 — PERFORMANCE

Create:

```text
performance budgets
load model
query plan
cache plan
queue plan
scaling plan
100-tenant simulation
100k-user stress scenario
```

---

# AGENT 20 — ACCESSIBILITY / MOBILE / I18N

Test:

```text
keyboard
screen reader
mobile
tablet
RTL
long translations
date/time
currency
timezone
contrast
reduced motion
```

---

# AGENT 21 — COMMERCIALIZATION

Research:

```text
enterprise buying criteria
implementation
security
migration
customer onboarding
demo
support
documentation
packaging
future billing architecture
```

---

# AGENT 22 — QA / EDGE CASES

Build a scenario suite for:

```text
roles
tenant
department
workflow
files
search
AI
integrations
concurrency
failure
migration
```

---

# AGENT 23 — CODE HEALTH

Audit:

```text
duplicate components
duplicate dependencies
business logic placement
API conventions
schema quality
TypeScript quality
testing
dead code
```

---

# AGENT 24 — SYNTHESIS

Consume all reports.

Produce:

```text
final blueprint
architecture decisions
gap priority
execution sequence
acceptance criteria
release gates
```

Do not invent unsupported functionality.

---

# TEAM OPERATING RULE

No agent is allowed to independently redefine:

```text
tenant model
permission model
workspace model
design system
workflow engine
```

without an explicit architecture decision shared with Agent 00 and Agent 24.

