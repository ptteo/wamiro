# WAMIRO — PHASE D15
## Compliance, Legal, Risk, Policy Governance & Enterprise Control
### Native Wamiro Workspace + Frappe-Style Enterprise UI + Exact Approved Palette

**Program:** Wamiro MNC-Grade Portal Transformation  
**Phase:** D15 — Compliance + Legal + Risk + Governance  
**Prerequisite:** D1–D14 completed  
**Primary goal:** Add a controlled enterprise governance layer for policies, compliance obligations, legal matters, risk, controls, reviews and evidence while reusing the existing Wamiro platform instead of creating another governance application.

---

# 1. D15 MISSION

D15 gives the organization one place to manage:

```text
Policies
Compliance
Controls
Risks
Legal matters
Contracts where already supported
Reviews
Evidence
Exceptions
Incidents
Audit follow-up
Governance tasks
```

The system should answer:

```text
What obligations exist?
What policies govern us?
What risks are open?
What controls exist?
Who owns them?
When were they last reviewed?
What evidence supports them?
What needs attention?
```

---

# 2. ABSOLUTE D15 RULE

Do not create a separate GRC/Legal application inside Wamiro.

Reuse:

```text
Knowledge
Documents
Requests
Work
People
Support
Analytics
AI
Administration
```

Do not create duplicate:

```text
workflow engine
approval engine
document repository
task engine
search
notifications
comments
permissions
audit
analytics
```

---

# 3. WORKSPACE ARCHITECTURE

If Compliance/Legal/Risk is enabled, create one major Rail workspace:

```text
Governance
```

Contextual Sidebar:

```text
Governance

Home
Policies
Compliance
Risks
Controls
Legal
Reviews
Evidence
Exceptions
Audit
Reports
```

Only enabled and authorized capabilities appear.

Do not create separate Rail items for:

```text
Policies
Risks
Controls
Legal
Audit
```

These belong inside Governance.

---

# 4. GOVERNANCE HOME

Primary question:

> **What governance matters need attention?**

Structure:

```text
Attention required
↓
Open risks
↓
Overdue reviews
↓
Policy actions
↓
Compliance obligations
↓
Exceptions
↓
Recent activity
```

Use:

```text
lists
queues
compact summaries
```

Do not build a giant compliance-card dashboard.

---

# 5. EXACT APPROVED PALETTE

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

No separate Legal palette.

No "security blue".

No gradient compliance dashboard.

No neon risk indicators.

---

# 6. SEMANTIC TOKENS

Use:

```text
text-ink-*
bg-surface-*
border-outline-*
```

or the shared Wamiro equivalents.

Do not scatter raw color values through the Governance workspace.

---

# 7. TYPOGRAPHY

Use:

```text
InterVar
```

and the existing hierarchy:

```text
tight UI text
paragraph text
sentence case
compact metadata
```

No oversized governance headings.

---

# 8. POLICY MANAGEMENT

Policies should live in D5 Knowledge/Documents and be surfaced through Governance.

Do not create another content repository.

Governance can manage:

```text
Policy
Owner
Status
Audience
Effective date
Review date
Version
Approval
```

---

# 9. POLICY LIST

Columns:

```text
Policy
Owner
Status
Review date
Version
Updated
```

Optional:

```text
Audience
Department
```

Use the shared D1 table/list pattern.

---

# 10. POLICY DETAIL

```text
Header
Policy content
Metadata
Approval
Version history
Related controls
Evidence
Activity
```

Reuse D5 Article/Document patterns.

---

# 11. POLICY LIFECYCLE

Use existing workflow infrastructure:

```text
Draft
↓
Review
↓
Approval
↓
Published
↓
Under Review
↓
Archived
```

Do not create a new workflow engine.

---

# 12. POLICY ACKNOWLEDGMENT

Where supported:

```text
Policy
↓
Audience
↓
Acknowledgment required
↓
Employee confirms
↓
Record stored
```

Use Requests/Workflow/Audit infrastructure.

---

# 13. ACKNOWLEDGMENT STATUS

Manager/HR/Compliance may see:

```text
Acknowledged
Pending
Overdue
```

Do not expose employee acknowledgment details to unauthorized users.

---

# 14. COMPLIANCE

Compliance area may include:

```text
Obligations
Requirements
Frameworks
Reviews
Controls
Evidence
Exceptions
```

Only implement supported compliance scope.

---

# 15. COMPLIANCE OBLIGATION

Record:

```text
Requirement
Owner
Framework
Frequency
Due date
Status
Evidence
```

Example:

```text
Annual policy review
Owner: Compliance
Due: 30 Sep
```

---

# 16. COMPLIANCE STATUS

Use controlled states:

```text
Open
In Progress
Compliant
At Risk
Non-Compliant
Closed
```

Use text/icons plus approved semantic styling.

---

# 17. COMPLIANCE REVIEW

Review:

```text
Requirement
Owner
Evidence
Findings
Action
Reviewer
Date
```

---

# 18. CONTROLS

Control record:

```text
Control
Description
Owner
Frequency
Evidence
Status
Last tested
Next test
```

---

# 19. CONTROL DETAIL

```text
Control
↓
Purpose
↓
Owner
↓
Procedure
↓
Evidence
↓
Testing
↓
Exceptions
↓
Activity
```

---

# 20. CONTROL TESTING

Flow:

```text
Control
↓
Test
↓
Evidence
↓
Result
↓
Finding
↓
Remediation
```

---

# 21. CONTROL RESULTS

Use:

```text
Effective
Needs Improvement
Ineffective
Not Tested
```

Do not create additional colors outside the approved palette.

---

# 22. RISK MANAGEMENT

Risk record:

```text
Risk
Owner
Category
Impact
Likelihood
Status
Mitigation
Review date
```

---

# 23. RISK LIST

Columns:

```text
Risk
Owner
Category
Impact
Likelihood
Status
Review date
```

Keep dense and operational.

---

# 24. RISK DETAIL

```text
Risk
Description
Impact
Likelihood
Owner
Mitigation
Controls
Actions
Reviews
Activity
```

---

# 25. RISK MATRIX

If an existing risk matrix is required:

```text
Likelihood
×
Impact
```

Use a restrained grid.

Do not create a rainbow heatmap.

Use:

```text
labels
position
icons
approved accents
```

to communicate severity.

---

# 26. RISK MITIGATION

Reuse D3 Work:

```text
Risk
↓
Task
↓
Owner
↓
Due date
↓
Completion
```

No second risk-task engine.

---

# 27. RISK ESCALATION

Reuse D4 Workflow:

```text
Risk becomes critical
↓
Workflow
↓
Notification
↓
Escalation
↓
Audit
```

---

# 28. RISK REVIEWS

Review fields:

```text
Risk
Reviewer
Date
Current impact
Current likelihood
Decision
Notes
```

---

# 29. EXCEPTIONS

Exception record:

```text
Exception
Reason
Owner
Scope
Start
Expiry
Approval
Status
```

---

# 30. EXCEPTION EXPIRY

Temporary exceptions must have:

```text
expiry
owner
review
audit
```

No invisible permanent exceptions.

---

# 31. EXCEPTION WORKFLOW

Reuse D4:

```text
Request
↓
Review
↓
Approval
↓
Exception active
↓
Review
↓
Expire / renew
```

---

# 32. LEGAL WORKSPACE

Legal remains inside Governance.

Possible existing functions:

```text
Legal matters
Contracts
Reviews
Approvals
Evidence
```

Only implement capabilities actually supported.

---

# 33. LEGAL MATTER LIST

Columns:

```text
Matter
Owner
Type
Status
Priority
Updated
```

---

# 34. LEGAL MATTER DETAIL

```text
Matter
Description
Owner
Status
People
Documents
Tasks
Deadlines
Activity
```

Reuse:

```text
People
Documents
Work
Activity
```

---

# 35. CONTRACTS

If contract management is already part of scope:

```text
Contract
Parties
Owner
Start
Expiry
Status
Documents
Approvals
Renewal
```

Do not build a complete CLM platform unless explicitly required.

---

# 36. CONTRACT DOCUMENTS

Reuse D5 Documents.

Do not create a legal-specific file repository.

---

# 37. CONTRACT RENEWAL

Where supported:

```text
Expiry approaching
↓
Notification
↓
Review
↓
Renew / terminate
```

Use central automation/workflows.

---

# 38. LEGAL DEADLINES

Use D3 Work/Calendar:

```text
Deadline
Owner
Due date
Task
Status
```

No separate deadline system.

---

# 39. EVIDENCE MANAGEMENT

Evidence must reuse D5 Documents.

Evidence item:

```text
Document
Owner
Requirement
Control
Date
Status
```

---

# 40. EVIDENCE DETAIL

```text
Evidence
Source document
Requirement
Control
Uploaded
Owner
Review
Activity
```

Permissions must follow the linked governance object and document policy.

---

# 41. EVIDENCE EXPIRY

Where applicable:

```text
Evidence valid until
Review due
Expired
```

Use reminders through the central notification system.

---

# 42. AUDIT FINDINGS

If audit findings already exist:

```text
Finding
Severity
Owner
Due date
Status
Evidence
Remediation
```

Remediation uses D3 Work.

---

# 43. REMEDIATION

Flow:

```text
Finding
↓
Action
↓
Task
↓
Owner
↓
Evidence
↓
Verification
↓
Close
```

---

# 44. GOVERNANCE TASKS

All governance work should reuse D3:

```text
Task
Project
Goal
Due date
Owner
```

Do not create Governance-specific task UX.

---

# 45. GOVERNANCE DOCUMENTS

Use D5:

```text
Policies
Evidence
Legal documents
Audit documents
Framework materials
```

No duplicate repository.

---

# 46. GOVERNANCE KNOWLEDGE

Use D5 Knowledge for:

```text
Policy explanations
Compliance guidance
FAQs
SOPs
Legal procedures
```

---

# 47. GOVERNANCE SEARCH

Contextual search:

```text
Policies
Requirements
Risks
Controls
Legal matters
Evidence
Exceptions
```

Global search may expose authorized governance records.

---

# 48. GOVERNANCE COMMAND PALETTE

Where supported:

```text
New risk
New control
Open policies
Review compliance
Create exception
Open legal matters
```

Only expose actual capabilities.

---

# 49. GOVERNANCE NOTIFICATIONS

Reuse the central notification center:

```text
Policy review due
Compliance obligation due
Control test due
Risk review due
Exception expiring
Contract expiring
Evidence expired
Audit action overdue
```

---

# 50. GOVERNANCE ANALYTICS

Reuse D7.

Possible existing metrics:

```text
Open risks
Overdue controls
Compliance status
Policy acknowledgments
Exceptions
Audit findings
```

Only expose data authorized for the viewer.

D15 does not create another analytics platform.

---

# 51. GOVERNANCE AI

Reuse D8 where already supported:

```text
Summarize policy
Explain requirement
Summarize risk
Find evidence
Compare documents
```

AI must not provide authoritative legal/compliance decisions unless the product explicitly supports the corresponding workflow.

---

# 52. LEGAL / COMPLIANCE AI GUARDRAIL

AI should communicate uncertainty where appropriate.

Do not present generated legal/compliance guidance as verified professional advice.

When relevant:

```text
Source
Policy
Document
Requirement
```

should be shown.

---

# 53. ADMINISTRATION INTEGRATION

D9 configures:

```text
Governance permissions
Frameworks
Policy categories
Risk categories
Control types
Review frequency
Retention
```

No duplicate settings system.

---

# 54. GOVERNANCE PERMISSIONS

Potential scopes:

```text
Own
Team
Department
Compliance
Legal
Executive
Organization
```

Sensitive governance records require explicit authorization.

---

# 55. PRIVILEGED GOVERNANCE DATA

Protect:

```text
Legal matters
Candidate disputes
Employee-related investigations
Confidential contracts
Security findings
Audit evidence
```

Do not assume executives or managers automatically have access.

---

# 56. TENANT ISOLATION

Release-blocking tests:

```text
Tenant A cannot access Tenant B policies
Tenant A cannot access Tenant B risks
Tenant A cannot access Tenant B evidence
Tenant A cannot access Tenant B contracts
Tenant A cannot access Tenant B audit findings
Tenant A cannot access Tenant B governance AI context
```

Test direct API and search paths.

---

# 57. GOVERNANCE AUDIT

Audit:

```text
policy.created
policy.updated
policy.published
policy.acknowledged

risk.created
risk.updated
risk.reviewed
risk.closed

control.created
control.tested
control.updated

exception.created
exception.approved
exception.expired

legal_matter.created
legal_matter.updated

contract.created
contract.updated
contract.renewed

evidence.uploaded
evidence.updated
evidence.expired

finding.created
finding.closed
```

---

# 58. D15 EXACT PALETTE

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

No independent Governance theme.

---

# 59. TYPOGRAPHY

Use:

```text
InterVar
```

with existing:

```text
tight UI text
paragraph text
sentence case
compact metadata
```

---

# 60. RISK/COMPLIANCE VISUAL STYLE

Use:

```text
tables
lists
queues
timelines
detail pages
```

Severity should be communicated through:

```text
label
position
icon
approved semantic treatment
```

not rainbow heatmaps or giant colored blocks.

---

# 61. NO GOVERNANCE MARKETING UI

Never create:

```text
giant compliance score cards
rainbow risk dashboards
gradient legal panels
glowing security shields
decorative courtroom imagery
3D compliance illustrations
```

Wamiro Governance must look operational and trustworthy.

---

# 62. EMPTY STATES

Risk:

```text
No risks recorded.

[Create risk]
```

Policies:

```text
No policies found.
```

Evidence:

```text
No evidence uploaded.

[Upload evidence]
```

---

# 63. ERROR STATES

```text
We couldn't load governance records.

[Retry]
```

Never show:

```text
database error
stack trace
provider exception
```

---

# 64. LOADING STATES

Keep:

```text
Rail
Sidebar
Header
```

visible.

Use skeleton tables/detail sections.

---

# 65. MOBILE GOVERNANCE

Mobile should prioritize:

```text
My risks
Policy review
Tasks
Approvals
Evidence
Deadlines
```

where the user is authorized to access them.

Do not recreate desktop risk matrices at tiny sizes.

---

# 66. MOBILE RISK DETAIL

Show:

```text
Risk
Impact
Likelihood
Owner
Mitigation
Due date
Actions
```

Use readable sections.

---

# 67. MOBILE POLICY

Show:

```text
Policy title
Status
Review date
Content
Acknowledgment
```

---

# 68. ACCESSIBILITY

Verify:

```text
keyboard
screen reader
tables
forms
dialogs
timelines
risk matrices
status
documents
```

Critical status must not depend solely on color.

---

# 69. PERFORMANCE

Design for:

```text
large policy libraries
large evidence repositories
large risk registers
large audit findings
large legal matter histories
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

# 70. PROVIDER ABSTRACTION

If external compliance/legal systems exist:

```text
GovernanceService
ComplianceService
LegalService
RiskService
```

with adapters where needed.

Frontend remains Wamiro-native.

---

# 71. D15 WORKSPACE GOVERNANCE

Governance is one major Rail workspace.

Inside it:

```text
Policies
Compliance
Risks
Controls
Legal
Reviews
Evidence
Exceptions
Audit
Reports
```

Do not promote these into individual Rail items.

---

# 72. D15 COMMANDS

Use existing operations only:

```text
New policy
New risk
New control
Create exception
Upload evidence
Open review
```

---

# 73. D15 SEARCH

Contextual Governance search:

```text
Policy
Risk
Control
Requirement
Legal matter
Evidence
Exception
```

All search results must be permission-filtered.

---

# 74. D15 IMPLEMENTATION ORDER

```text
1. Governance Rail workspace
2. Governance contextual Sidebar
3. Governance Home
4. Policy management integration
5. Compliance obligations
6. Compliance reviews
7. Controls
8. Control testing
9. Risk register
10. Risk detail
11. Risk mitigation
12. Risk reviews
13. Exceptions
14. Exception workflow
15. Legal matters
16. Contract integration where already supported
17. Contract renewal integration where already supported
18. Evidence management
19. Audit findings
20. Remediation
21. Search
22. Command palette
23. Notifications
24. Analytics integration
25. AI integration
26. Administration integration
27. Mobile Governance
28. Security
29. Audit
30. Accessibility
31. Performance
32. Exact palette verification
33. Light/dark QA
34. Visual QA
35. D16 backlog
```

---

# 75. D15 DELIVERABLES

```text
01. Governance Workspace
02. Governance Contextual Sidebar
03. Governance Home
04. Policy Management Integration
05. Compliance Obligations
06. Compliance Reviews
07. Controls
08. Control Testing
09. Risk Register
10. Risk Detail
11. Risk Mitigation
12. Risk Reviews
13. Exceptions
14. Exception Workflow
15. Legal Matters
16. Contract Integration where supported
17. Contract Renewal Integration where supported
18. Evidence Management
19. Audit Findings
20. Remediation
21. Governance Search
22. Governance Commands
23. Governance Notifications
24. Analytics Integration
25. AI Integration
26. Administration Integration
27. Mobile Governance
28. Permission UX
29. Security Verification
30. Audit
31. Accessibility Verification
32. Performance Verification
33. Exact Palette Verification
34. Light Mode Verification
35. Dark Mode Verification
36. D16 Backlog
```

---

# 76. DEFINITION OF DONE

D15 is complete only when:

```text
Governance is a major Wamiro workspace.

The Rail switches into Governance.

The Sidebar contains only governance features allowed for the user.

Policies reuse D5.

Documents/evidence reuse D5.

Tasks/remediation reuse D3.

Requests/approvals reuse D4.

People reuse D2.

Analytics reuse D7.

AI respects Governance permissions.

Administration configures Governance.

Legal/confidential records are protected.

Tenant isolation is verified.

Sensitive records are permission-controlled.

Audit is centralized.

Search respects authorization.

Mobile works.

Accessibility is verified.

Performance is acceptable.

Light mode uses only the approved palette.

Dark mode uses only the approved palette.

No gradients exist.

No unrelated colors exist.

No separate GRC/Legal design language exists.

Everything feels native to Wamiro.
```

---

# 77. AGENT EXECUTION RULE

Before implementation:

```text
Inspect D2 People
↓
Inspect D3 Work
↓
Inspect D4 Requests/Workflow
↓
Inspect D5 Knowledge/Documents
↓
Inspect D7 Analytics
↓
Inspect D8 AI
↓
Inspect D9 Administration
↓
Inspect D10 quality system
```

Then:

```text
Implement
↓
Run
↓
Test confidential-data permissions
↓
Test tenant isolation
↓
Test evidence access
↓
Test policy acknowledgment
↓
Test approval workflow
↓
Test API authorization
↓
Test search authorization
↓
Test AI authorization
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

Never claim legal/compliance correctness or certification merely because the UI/workflow exists.

---

# 78. FINAL D15 PRINCIPLE

> **Governance should make the organization easier to control, not harder to operate.**

The ideal flow:

```text
Policy
↓
Requirement
↓
Control
↓
Evidence
↓
Review
↓
Risk / Finding
↓
Remediation
↓
Audit
```

all inside one connected Wamiro system.

---

# 79. FINAL D15 TARGET

The Governance experience should feel:

```text
Controlled
Precise
Private
Structured
Auditable
Transparent
Permission-aware
Enterprise-grade
```

not like a separate compliance product.

---

# WAMIRO

> **One workplace. One operating system for your organization.**
