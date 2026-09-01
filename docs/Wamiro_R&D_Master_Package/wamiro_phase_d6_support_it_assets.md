# WAMIRO — PHASE D6
## Support, IT Service Management, Assets & Operational Support

**Program:** Wamiro MNC-Grade UI/UX Transformation  
**Phase:** D6 — Support + IT + Assets  
**Prerequisite:** D1 + D2 + D3 + D4 + D5  
**Goal:** Make Support/IT/Assets a native Wamiro workspace while keeping external providers replaceable.

---

# 1. D6 MISSION

Wamiro becomes the organization's operational support front door.

Employees can:

```text
Get help
Report an issue
Request access
Request software
Request equipment
Track support
Find knowledge
View assigned assets
```

IT teams can:

```text
Manage tickets
Manage incidents
Handle service requests
Manage SLA
Manage assets
Manage devices
Use knowledge
Manage workload
```

The UI must remain Wamiro-native even when Zammad, GLPI or another system executes the underlying operation.

---

# 2. WORKSPACE ARCHITECTURE

Support is a **major Rail workspace**.

The Rail selects the major domain; the contextual Sidebar shows only features belonging to that workspace.

Employee:

```text
Support
  Home
  My Tickets
  My Requests
  Knowledge
  My Devices
  My Assets
  Service Catalog
```

IT/Admin:

```text
Support
  Home
  Tickets
  Incidents
  Requests
  Problems
  Changes
  Assets
  Devices
  Knowledge
  Service Catalog
  SLA
  Reports
```

Admin-only configuration can live under an appropriate Support/Admin section.

Never create one permanent global sidebar containing every support capability.

---

# 3. APPROVED PALETTE

D6 uses only the approved Wamiro palette:

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

No new application colors.

No gradients.

No neon/glow styling.

No purple/blue AI styling.

Uploaded media and provider logos may retain their native colors without changing Wamiro's UI theme.

---

# 4. FRAPPE REFERENCE ARCHETYPES

Use the Frappe recipes as reference patterns:

```text
Tickets → service desk
Files → asset/document lists
Tasks → operational work
Discussions → support communication
Compose → support replies/knowledge
```

D6 also adds Wamiro-specific workspaces:

```text
Service Catalog
Incident Management
Asset Management
Device Management
SLA
Problem Management
Change Management
```

All use the D1 workspace grammar.

---

# 5. SUPPORT HOME

Employee question:

> What help do I need?

Structure:

```text
Search / Get help
↓
Quick actions
↓
My open tickets
↓
Requests awaiting action
↓
My assets/devices
↓
Relevant knowledge
```

Quick actions:

```text
Create ticket
Request access
Request software
Report incident
Search knowledge
```

Do not turn employee Support Home into a KPI dashboard.

---

# 6. IT SUPPORT HOME

IT question:

> What needs my attention?

Structure:

```text
Attention required
↓
New tickets
↓
Urgent incidents
↓
SLA risk
↓
Unassigned
↓
My workload
↓
Recent activity
```

Use queues and lists before charts.

---

# 7. TICKET WORKSPACE

Use the D1 List + Detail + SplitPane patterns.

Views:

```text
My tickets
Unassigned
Urgent
Open
Waiting
Resolved
Closed
```

Desktop:

```text
Sidebar
+
Ticket List
+
Ticket Detail
```

Mobile:

```text
Ticket List
↓
Ticket Detail
```

---

# 8. TICKET LIST

Columns:

```text
Ticket
Requester
Category
Priority
Status
Assignee
Updated
SLA
```

Keep rows compact and metadata aligned.

---

# 9. TICKET DETAIL

```text
Header
↓
Issue summary
↓
Conversation
↓
Attachments
↓
Activity
↓
Related knowledge
↓
Related assets
```

Metadata:

```text
Requester
Assignee
Priority
Status
Category
Created
Updated
SLA
```

---

# 10. SUPPORT CONVERSATION

Reuse the D5 communication system:

```text
Reply
Internal note
Mention
Attachment
Status change
```

Never build a second chat component.

---

# 11. INTERNAL NOTES

Internal notes are visible only to authorized support users.

Requirements:

```text
Server-side authorization
Tenant isolation
Audit
Never expose as customer-facing reply
```

---

# 12. SERVICE CATALOG

Employee-facing categories:

```text
Access
Hardware
Software
Accounts
Security
Travel where enabled
Facilities where enabled
```

Service item:

```text
Icon
Name
Short description
Eligibility
Expected time

[Request]
```

Keep these compact rather than marketing-style cards.

---

# 13. SERVICE DETAIL

Example:

```text
Adobe Creative Cloud

Software
Available to eligible employees

[Request access]
```

Show:

```text
Eligibility
Approval process
Expected time
Requirements
```

---

# 14. ACCESS REQUEST

Reuse D4:

```text
Service Catalog
↓
Request
↓
Workflow
↓
Approval
↓
IT execution
↓
Notification
```

Do not create a second access/approval engine.

---

# 15. INCIDENT MANAGEMENT

Core fields:

```text
Title
Impact
Priority
Status
Owner
Affected service
Started
Updated
```

Primary question:

> What is broken, how severe is it, and who is handling it?

---

# 16. INCIDENT DETAIL

```text
Incident header
Impact
Timeline
Affected services
Actions
Communication
Related tickets
Resolution
```

Statuses:

```text
Detected
Investigating
Identified
Mitigating
Resolved
Closed
```

Use text/icons in addition to color.

---

# 17. PROBLEM MANAGEMENT

Use the same ticket/detail grammar:

```text
Problem
↓
Related incidents
↓
Root cause
↓
Resolution
```

No second issue-tracking UI.

---

# 18. CHANGE MANAGEMENT

Change record:

```text
Change
Risk
Owner
Schedule
Approval
Impact
Rollback plan
Status
```

Use D4 Approval/Workflow infrastructure.

---

# 19. ASSET WORKSPACE

Assets:

```text
Laptop
Desktop
Monitor
Phone
Tablet
Accessory
Software license
Other
```

Primary archetype:

```text
Table
+
Detail
```

---

# 20. ASSET LIST

Columns:

```text
Asset
Type
Assigned to
Status
Location
Identifier
Updated
```

Sensitive identifiers are permission-controlled.

---

# 21. ASSET DETAIL

```text
Asset
↓
Assignment
↓
Specifications
↓
Lifecycle
↓
History
↓
Related tickets
```

---

# 22. ASSET LIFECYCLE

Default:

```text
Available
Assigned
In Repair
Retired
Lost
Disposed
```

Allow organization-specific extensions later.

---

# 23. ASSET ASSIGNMENT

```text
Asset
↓
Assign
↓
Employee
↓
Effective date
↓
Confirm
↓
Audit
```

Reuse D2 People components.

---

# 24. ASSET RETURN

```text
Return asset
↓
Condition
↓
Location
↓
Notes
↓
Confirm
```

---

# 25. ASSET HISTORY

Use the shared Wamiro timeline:

```text
Assigned to Rahul
Returned
Assigned to Sarah
Repair started
Repair completed
Retired
```

---

# 26. DEVICE FOUNDATION

Track:

```text
Owner
OS
Last seen
Trust status
Related asset
```

Devices may include:

```text
Laptop
Phone
Tablet
Desktop
```

Do not build full MDM in D6.

---

# 27. DEVICE DETAIL

```text
Device
Owner
OS
Last seen
Security state
Related asset
Tickets
```

---

# 28. KNOWLEDGE INTEGRATION

Ticket detail should show relevant D5 knowledge:

```text
VPN troubleshooting
Password reset
Laptop setup
Email configuration
```

Allow:

```text
Open article
Attach article
Suggest article
```

---

# 29. PEOPLE INTEGRATION

Ticket:

```text
Requester
↓
Employee
↓
Team
↓
Assets
↓
Previous tickets
```

Reuse D2.

---

# 30. WORK INTEGRATION

Where useful:

```text
Ticket
↓
Project
↓
Task
```

Reuse D3.

---

# 31. REQUEST INTEGRATION

A support issue may become a D4 Request or invoke a D4 Workflow.

Do not duplicate request logic.

---

# 32. SLA

Track:

```text
First response
Resolution
Remaining
Breached
```

Example:

```text
Resolution SLA
1h 24m remaining
```

Use typography, icons and the approved palette.

---

# 33. SLA DASHBOARD

Views:

```text
At risk
Breached
Due soon
Healthy
```

Prefer actionable lists and queues.

---

# 34. SLA ESCALATION

Reuse D4:

```text
SLA warning
↓
Notify owner
↓
Escalate
↓
Notify manager
```

No second automation engine.

---

# 35. SUPPORT NOTIFICATIONS

Central events:

```text
Ticket assigned
Ticket updated
Mentioned
SLA warning
SLA breached
Ticket resolved
Request approved
Asset assigned
Asset returned
```

---

# 36. SUPPORT MOBILE

Employee:

```text
Search help
Create ticket
My tickets
Ticket detail
Reply
Attachment
```

Agent:

```text
My workload
Urgent tickets
Ticket detail
Reply
Assign
Status
```

---

# 37. EMPTY / ERROR / DEGRADED STATES

Empty:

```text
No open tickets.

You're all caught up.
```

Error:

```text
We couldn't load your tickets.

[Retry]
```

Provider degraded:

```text
Support service is temporarily unavailable.

Other Wamiro workspaces remain available.

[Retry]
```

Never expose raw provider errors.

---

# 38. PROVIDER ABSTRACTION

Keep external systems behind adapters:

```text
SupportService
↓
SupportProvider
↓
Zammad / GLPI / Future provider

AssetService
↓
AssetProvider
↓
GLPI / Future provider
```

No vendor-specific API calls inside React components.

---

# 39. D6 EVENTS

Prepare:

```text
ticket.created
ticket.updated
ticket.assigned
ticket.reassigned
ticket.status_changed
ticket.priority_changed
ticket.comment_added
ticket.resolved
ticket.closed

incident.created
incident.updated
incident.resolved

asset.created
asset.assigned
asset.returned
asset.updated
asset.retired

device.registered
device.updated
device.trust_changed

service_catalog.updated
sla.updated
support_integration.updated
```

Later consumers:

```text
notifications
analytics
AI
automation
audit
integrations
```

---

# 40. D6 SECURITY

Test:

```text
Employee sees only authorized tickets.
Internal notes remain private.
Asset identifiers are correctly restricted.
Unauthorized employee data remains hidden.
Tenant A cannot access Tenant B support data.
Provider credentials never reach the browser.
Exports remain permission-controlled.
```

---

# 41. D6 AUDIT

Audit:

```text
ticket.created
ticket.assigned
ticket.reassigned
ticket.status_changed
ticket.resolved

asset.assigned
asset.returned
asset.updated
asset.retired

device.trust_changed

service_catalog.updated
sla.updated
support_integration.updated
```

---

# 42. D6 PERFORMANCE

Design for:

```text
1,000 tickets
10,000 tickets
100,000+ tickets
10,000 assets
```

Use:

```text
server-side filtering
pagination
indexed search
virtualization where needed
lazy loading
```

---

# 43. D6 PALETTE COMPLIANCE

Scan UI styles for:

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

No additional application theme colors.

---

# 44. VISUAL ANTI-PATTERNS

Never create:

```text
Gradient ticket cards
Neon incident banners
Rainbow asset statuses
Purple AI support panels
Glowing SLA meters
Oversized hardware cards
Decorative 3D equipment
```

Use:

```text
structured lists
compact metadata
clear hierarchy
quiet surfaces
```

---

# 45. D6 VALIDATION SCREENS

Validate:

```text
1. Support Home
2. Ticket List
3. Ticket Detail
4. Service Catalog
5. Service Detail
6. Incident List
7. Incident Detail
8. Asset List
9. Asset Detail
10. Device List
11. Device Detail
12. SLA View
13. My Tickets
14. Mobile Ticket Detail
```

---

# 46. D6 IMPLEMENTATION ORDER

```text
1. Support rail workspace
2. Support contextual sidebar
3. Support Home
4. Ticket list
5. Ticket detail
6. Ticket conversation
7. Internal notes
8. Saved ticket views
9. Service Catalog
10. Service Detail
11. Incident management
12. Incident detail/timeline
13. Problem foundation
14. Change foundation
15. Asset list
16. Asset detail
17. Asset assignment/return
18. Device model
19. Device detail
20. Knowledge integration
21. People integration
22. Work integration
23. Request integration
24. SLA
25. Escalations
26. Notifications
27. Mobile Support
28. Permissions
29. Audit
30. Accessibility
31. Performance
32. Exact palette verification
33. Visual QA
34. D7 backlog
```

---

# 47. D6 DELIVERABLES

```text
01. Support Workspace
02. Workspace-aware Support Sidebar
03. Support Home
04. Ticket List
05. Ticket Detail
06. Ticket Conversation
07. Internal Notes
08. Saved Views
09. Service Catalog
10. Service Detail
11. Incident Management
12. Problem Foundation
13. Change Foundation
14. Asset Management
15. Asset Detail
16. Asset Assignment
17. Asset Return
18. Device Foundation
19. Device Detail
20. Knowledge Integration
21. People Integration
22. Work Integration
23. Request Integration
24. SLA
25. Escalations
26. Notifications
27. Mobile Support
28. Permission UX
29. Audit
30. Performance Verification
31. Accessibility Verification
32. Exact Palette Verification
33. D7 Backlog
```

---

# 48. D6 DEFINITION OF DONE

```text
Support is a major Wamiro workspace.

The rail switches into Support.

The Support sidebar shows only Support features allowed for the current user.

Employee and IT experiences are appropriately scoped.

Tickets use one Wamiro service-desk experience.

Requests reuse D4.

Knowledge reuses D5.

People reuses D2.

Work reuses D3.

Assets use one consistent asset system.

Devices have a secure foundation.

SLA uses D4 workflow/automation.

Provider systems remain replaceable.

Tenant isolation is verified.

Permissions are enforced.

Audit is centralized.

Mobile works.

Light mode uses only the approved palette.

Dark mode uses only the approved palette.

No gradients exist.

No unrelated application colors exist.

Every D6 screen uses the D1 shell and workspace grammar.
```

---

# 49. AGENT EXECUTION RULE

Do not create a separate IT product inside Wamiro.

Reuse:

```text
D1 shell/design system
D2 People
D3 Work
D4 Requests/Workflow
D5 Knowledge/Documents/Communication
```

For each D6 feature:

```text
Inspect
↓
Choose workspace/archetype
↓
Reuse components
↓
Implement
↓
Run
↓
Test provider boundary
↓
Test tenant isolation
↓
Test permissions
↓
Test light/dark
↓
Check exact palette
↓
Test accessibility
↓
Test performance
↓
Polish
↓
Document
```

---

# 50. FINAL D6 PRINCIPLE

> **Wamiro should be the single operational front door for employee support.**

Employee:

> “I need help → I go to Wamiro.”

IT agent:

> “I can manage support from Wamiro.”

Administrator:

> “I can understand tickets, assets, service health and access from one workspace.”

The experience must remain:

```text
Structured
Quiet
Dense
Fast
Connected
Secure
Permission-aware
Tenant-aware
Provider-agnostic
Enterprise-grade
```

---

# WAMIRO

> **One workplace. One operating system for your organization.**
