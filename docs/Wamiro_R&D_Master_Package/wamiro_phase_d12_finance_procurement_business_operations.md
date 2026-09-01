# WAMIRO — PHASE D12
## Finance, Expenses, Procurement, Vendors & Business Operations
### Native Wamiro Workspace + Frappe-Style Enterprise UI + Exact Approved Palette

**Program:** Wamiro MNC-Grade Portal Transformation  
**Phase:** D12 — Finance + Procurement + Business Operations  
**Prerequisite:** D1–D11 completed  
**Primary goal:** Complete the remaining major enterprise business-operations layer by bringing Finance, Expenses, Procurement and administrative business operations into the same Wamiro operating-system architecture.

---

# 1. D12 MISSION

D12 completes the business-operations side of Wamiro.

The goal is to give authorized employees, managers, finance teams and administrators one place to:

```text
Submit expenses
Request purchases
Track reimbursements
Manage vendors
Manage budgets
Request travel
Review financial approvals
Track procurement
Monitor business operations
```

The experience must remain:

```text
Wamiro
+
same Rail
+
contextual Sidebar
+
same components
+
same typography
+
same exact palette
```

It must not feel like a separate accounting product.

---

# 2. ABSOLUTE D12 RULE

D12 is for implementing/redesigning Finance and Business Operations capabilities that are actually part of the Wamiro product scope.

Do not add speculative ERP features just because they are common in accounting software.

Prioritize:

```text
Expenses
Reimbursements
Purchase Requests
Procurement
Vendors
Budgets
Travel Requests
Finance Approvals
Business Operations
```

Anything beyond approved scope goes into the future roadmap.

---

# 3. WORKSPACE ARCHITECTURE

Finance becomes a major Rail workspace.

```text
Rail

Home
People
Work
Requests
Knowledge
Documents
Support
Finance
Analytics
AI
Administration
```

When the user selects:

```text
Finance
```

the contextual Sidebar changes to Finance-specific navigation.

---

# 4. FINANCE SIDEBAR

Employee:

```text
Finance
  Home
  My Expenses
  Reimbursements
  Purchase Requests
  Travel
```

Manager:

```text
Finance
  Team Expenses
  Purchase Approvals
  Purchase Requests
  Travel Approvals
  Budgets where authorized
```

Finance/admin:

```text
Finance
  Home
  Expenses
  Reimbursements
  Purchases
  Procurement
  Vendors
  Budgets
  Travel
  Approvals
  Reports
  Configuration
```

Only features allowed by permissions and enabled modules should appear.

---

# 5. FINANCE HOME

Employee:

```text
My pending reimbursements
My expenses
Purchase requests
Travel
```

Manager:

```text
Team expenses
Pending approvals
Budget requests
```

Finance:

```text
Pending approvals
Expense backlog
Reimbursements
Purchases
Budget warnings
Vendor activity
```

Use compact lists and operational tables.

Do not create a giant card dashboard.

---

# 6. EXACT APPROVED PALETTE

D12 must use only:

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

No gradient finance cards.

No separate Finance theme.

---

# 7. SEMANTIC TOKENS

Use:

```text
text-ink-*
bg-surface-*
border-outline-*
```

or Wamiro equivalents mapped to the approved palette.

Do not use arbitrary raw colors in components.

---

# 8. LIGHT AND DARK MODE

Both themes use the same Wamiro palette and semantic hierarchy.

Light:

```text
#F8F8F8
#D9D9D9
#AFAFAF
#242424
#383838
```

Dark:

```text
#171717
#242424
#383838
```

No separate Finance dark theme.

---

# 9. TYPOGRAPHY

Use:

```text
InterVar
```

Use tight text for:

```text
table cells
labels
buttons
statuses
numbers
timestamps
```

Use paragraph text for:

```text
descriptions
helper text
explanations
```

No oversized financial typography.

---

# 10. EXPENSE WORKSPACE

Core employee flow:

```text
Expenses
↓
My Expenses
↓
Create Expense
↓
Submit
↓
Approval
↓
Reimbursement
```

---

# 11. EXPENSE LIST

Use the shared Wamiro table.

Columns:

```text
Expense
Date
Category
Amount
Status
Submitted
```

Optional:

```text
Approver
Project
Cost center
```

---

# 12. EXPENSE DETAIL

Use D1 Detail + Meta:

```text
Header
↓
Expense details
↓
Receipt
↓
Approval history
↓
Comments
↓
Activity
```

Metadata:

```text
Employee
Category
Amount
Currency
Date
Project
Cost center
Status
```

---

# 13. EXPENSE CREATION

Use one structured form:

```text
Category
Amount
Currency
Date
Description
Project where applicable
Cost center where applicable
Receipt
```

Primary:

```text
Save
```

Submit separately if the existing lifecycle supports draft/submission.

---

# 14. RECEIPTS

Reuse D5 Documents.

States:

```text
Uploading
Processing
Uploaded
Failed
```

No separate finance storage implementation.

---

# 15. EXPENSE STATUS

Use:

```text
Draft
Submitted
In Review
Approved
Rejected
Reimbursed
Canceled
```

Use text/icons in addition to semantic styling.

---

# 16. REIMBURSEMENTS

Flow:

```text
Approved expense
↓
Reimbursement
↓
Processing
↓
Paid
```

List:

```text
Employee
Amount
Expenses
Status
Submitted
Paid
```

---

# 17. REIMBURSEMENT DETAIL

```text
Employee
Expense summary
Amount
Payment status
Approval history
Payment information where authorized
Activity
```

Never expose unnecessary bank/payment data.

---

# 18. PURCHASE REQUESTS

Reuse D4 Request architecture.

Flow:

```text
Purchase request
↓
Approval
↓
Procurement
↓
Vendor
↓
Order/process
↓
Completion
```

No second approval engine.

---

# 19. PURCHASE REQUEST LIST

Columns:

```text
Request
Requester
Department
Amount
Vendor
Status
Created
```

---

# 20. PURCHASE REQUEST DETAIL

```text
Request
Items
Justification
Budget / cost center
Vendor
Attachments
Approval history
Comments
Activity
```

---

# 21. PROCUREMENT

Procurement workspace:

```text
Requests
Purchase orders where already supported
Vendors
Approvals
Procurement activity
```

Do not attempt to build a complete ERP procurement suite unless explicitly in scope.

---

# 22. PROCUREMENT QUEUE

Primary question:

> **What procurement work needs attention?**

Use queues:

```text
Pending review
Approved
Waiting for vendor
In progress
Completed
```

---

# 23. VENDOR MANAGEMENT

Vendor table:

```text
Vendor
Category
Status
Owner
Last activity
```

Optional where supported:

```text
Spend
Contracts
Contact
```

---

# 24. VENDOR DETAIL

```text
Vendor
Contact
Status
Categories
Documents
Requests
Purchase activity
Notes
```

Reuse:

```text
People
Documents
Requests
Activity
```

components.

---

# 25. VENDOR DOCUMENTS

Vendor documents use the D5 document system.

Permissions:

```text
tenant
+
vendor access
+
document policy
```

---

# 26. VENDOR STATUS

Use:

```text
Active
Pending
Inactive
Blocked
```

Use compact text/icon treatment.

---

# 27. BUDGETS

Budget foundation:

```text
Budget
Department
Period
Owner
Amount
Spent
Remaining
Status
```

Only implement budget capabilities supported by the actual Wamiro data model.

---

# 28. BUDGET DETAIL

```text
Budget
↓
Allocation
↓
Spent
↓
Remaining
↓
Requests
↓
Activity
```

---

# 29. BUDGET WARNINGS

Examples:

```text
Budget nearly exhausted
Budget exceeded
Unallocated request
```

Use approved palette plus labels/icons.

---

# 30. BUDGET → REQUEST CONNECTION

When a purchase request affects a budget:

```text
Request
↓
Budget
↓
Available
↓
Requested
↓
Remaining
```

---

# 31. TRAVEL

Travel remains part of Finance/Requests where appropriate.

Flow:

```text
Travel request
↓
Approval
↓
Booking/processing where integrated
↓
Expense
↓
Reimbursement
```

Reuse D4.

---

# 32. TRAVEL REQUEST

Fields:

```text
Traveler
Destination
Dates
Purpose
Estimated cost
Project/cost center
Attachments
```

No duplicate approval logic.

---

# 33. TRAVEL EXPENSE CONNECTION

Approved travel can connect to:

```text
Expenses
Reimbursements
Documents
Requests
```

---

# 34. FINANCE APPROVAL CENTER

Use D4 Approval Center.

Filters:

```text
Expense
Purchase
Travel
Budget
```

No second approval UI.

---

# 35. FINANCE SEARCH

Global search may return:

```text
Expense
Purchase Request
Vendor
Budget
Reimbursement
```

Use one search component with permission filtering.

---

# 36. SAVED FINANCE VIEWS

Examples:

```text
My pending expenses
Pending reimbursements
Purchase approvals
Budget warnings
Vendor requests
```

Use shared D1 Saved Views.

---

# 37. FINANCE TABLE DENSITY

Use:

```text
40px → dense
44–60px → standard
```

Keep:

```text
amounts
dates
statuses
```

aligned in stable trailing columns.

---

# 38. FINANCIAL NUMBER FORMATTING

Use one consistent formatter for:

```text
currency
percentage
decimal
quantity
duration
```

Examples must follow the customer's locale and configuration.

Do not assume every tenant uses INR.

---

# 39. CURRENCY

Preserve:

```text
currency code
currency symbol
precision
locale
```

---

# 40. MULTI-CURRENCY

If supported:

```text
Original currency
Converted currency
Exchange rate
Conversion date
```

Do not silently change values.

---

# 41. FINANCIAL AUDIT

Audit:

```text
expense.created
expense.submitted
expense.approved
expense.rejected
expense.reimbursed

purchase.created
purchase.approved
purchase.rejected

budget.updated

vendor.created
vendor.updated

travel.created
travel.approved
```

---

# 42. FINANCE SECURITY

Verify:

```text
Employee
Manager
Finance
Admin
Executive
```

only see authorized financial information.

---

# 43. FINANCIAL PERMISSION SCOPE

Where supported:

```text
Own
Team
Department
Organization
```

Do not make all financial data company-wide by default.

---

# 44. SENSITIVE PAYMENT DATA

Never expose unnecessarily:

```text
full bank accounts
payment secrets
authentication tokens
financial credentials
```

Use masking where display is necessary.

---

# 45. FINANCE EXPORTS

Exports respect:

```text
permissions
tenant
filters
data sensitivity
```

Sensitive exports should be auditable.

---

# 46. FINANCE NOTIFICATIONS

Reuse the central notification system:

```text
Expense submitted
Expense approved
Expense rejected
Reimbursement paid
Purchase approval requested
Budget warning
Vendor update
Travel approval
```

---

# 47. FINANCE + PEOPLE

Expense:

```text
Employee
↓
Profile
↓
Department
↓
Manager
```

Reuse D2 People.

---

# 48. FINANCE + WORK

Where supported:

```text
Expense
↓
Project
↓
Task
↓
Goal/cost center
```

Reuse D3.

---

# 49. FINANCE + REQUESTS

Finance requests use D4:

```text
form
workflow
approval
comments
attachments
audit
```

Do not duplicate those systems.

---

# 50. FINANCE + DOCUMENTS

Receipts, invoices and vendor documents use D5.

No second file system.

---

# 51. FINANCE + ANALYTICS

D7 consumes authorized finance data.

D12 does not create a second analytics platform.

---

# 52. FINANCE + AI

D8 may use existing finance data for:

```text
Summarize expenses
Explain budget changes
Find reimbursement
```

only where already supported and authorized.

---

# 53. FINANCE HOME VISUAL STRUCTURE

Frappe-style:

```text
Page Header
↓
Compact filters/actions
↓
Small KPI strip where existing data supports it
↓
Primary queue/list
↓
Secondary detail
```

Avoid giant finance-card dashboards.

---

# 54. NO FINANCE GRADIENTS

Never use:

```text
green gradient revenue card
gold gradient finance card
purple finance chart
glowing money icon
```

---

# 55. DARK MODE

Verify:

```text
expense tables
amounts
receipts
approval dialogs
budget views
vendor pages
```

in dark mode.

---

# 56. LIGHT MODE

Verify the same screens in light mode.

Structure must remain identical.

---

# 57. EMPTY STATES

Expense:

```text
No expenses yet.

Create an expense to get started.

[New expense]
```

Reimbursement:

```text
No reimbursements yet.
```

Vendor:

```text
No vendors yet.

[Add vendor]
```

---

# 58. ERROR STATES

```text
We couldn't load your expenses.

[Retry]
```

Provider issue:

```text
Finance data is temporarily unavailable.

Other Wamiro workspaces remain available.
```

No raw provider errors.

---

# 59. LOADING STATES

Keep:

```text
Rail
Sidebar
Header
```

visible.

Use:

```text
skeleton tables
skeleton detail
button loading
```

---

# 60. MOBILE FINANCE

Employee:

```text
My expenses
Expense detail
New expense
Reimbursements
Requests
```

Manager:

```text
Approval queue
Expense detail
Approve
Reject
```

Finance:

```text
Queues
Tables
Detail
```

---

# 61. MOBILE EXPENSE CREATION

Use:

```text
one column
comfortable controls
receipt upload where supported
clear Save/Submit
```

---

# 62. MOBILE APPROVAL

Show:

```text
Request
Amount
Context
Attachments
History
Decision
```

---

# 63. FINANCE ACCESSIBILITY

Verify:

```text
keyboard
screen reader
tables
forms
dialogs
status
amounts
charts if present
```

Numbers must remain understandable without color.

---

# 64. FINANCE PERFORMANCE

Design for:

```text
1,000 expenses
10,000 expenses
100,000+ expenses
large procurement data
large vendor lists
```

Use:

```text
server-side filtering
pagination
indexed queries
virtualization where needed
```

---

# 65. PROVIDER ABSTRACTION

If an external finance/accounting provider exists:

```text
FinanceService
↓
FinanceProvider
↓
Provider implementation
```

The UI remains Wamiro-native.

---

# 66. D12 MODULE DEPENDENCIES

Finance may integrate with:

```text
People
Requests
Work
Documents
Analytics
Administration
```

Dependencies must be explicit.

---

# 67. D12 WORKSPACE GOVERNANCE

Finance is a major Rail workspace because it is a distinct business mental model.

Its features belong in the contextual Sidebar.

Do not promote:

```text
Expenses
Reimbursements
Vendors
Budgets
Travel
```

to individual Rail items.

---

# 68. D12 SEARCH ARCHITECTURE

Contextual Finance search:

```text
Expenses
Purchases
Vendors
Budgets
Reimbursements
```

Global search may include them when supported.

---

# 69. D12 COMMAND PALETTE

Finance-specific commands:

```text
New expense
New purchase request
New vendor
Open reimbursements
Open approvals
```

Only expose commands for supported operations.

---

# 70. D12 AUDIT

Audit:

```text
expense.created
expense.updated
expense.submitted
expense.approved
expense.rejected
expense.reimbursed

purchase.created
purchase.updated
purchase.approved
purchase.rejected

vendor.created
vendor.updated
vendor.archived

budget.created
budget.updated

travel.created
travel.approved
```

---

# 71. D12 SECURITY TESTS

Test:

```text
Employee cannot see another employee's restricted expense
Manager cannot view unauthorized department finance data
Finance user cannot access unrelated restricted HR data
Unauthorized user cannot approve financial requests
Unauthorized user cannot export financial data
Tenant A cannot see Tenant B financial records
AI cannot access unauthorized finance data
Receipts cannot bypass document permissions
```

---

# 72. D12 PALETTE AUDIT

Search:

```text
#hex
rgb(
rgba(
hsl(
hsla(
named colors
```

Every Wamiro UI color must map to:

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
uploaded receipt/document content
vendor logos
external media
```

---

# 73. D12 VISUAL ANTI-PATTERNS

Never create:

```text
giant finance cards
rainbow accounting charts
gradient budget indicators
oversized currency numbers
decorative finance illustrations
glowing money icons
```

Use:

```text
tables
lists
compact summaries
aligned values
quiet surfaces
```

---

# 74. D12 VALIDATION SCREENS

Validate:

```text
1. Finance Home
2. Expense List
3. Expense Detail
4. New Expense
5. Reimbursement List
6. Reimbursement Detail
7. Purchase Request List
8. Purchase Request Detail
9. Procurement Queue
10. Vendor List
11. Vendor Detail
12. Budget List
13. Budget Detail
14. Travel Requests
15. Finance Approval Center
16. Mobile Expense
17. Mobile Approval
```

---

# 75. D12 IMPLEMENTATION ORDER

```text
1. Finance Rail workspace
2. Finance contextual sidebar
3. Finance Home
4. Expense list
5. Expense detail
6. Expense creation
7. Receipt integration
8. Reimbursements
9. Purchase requests
10. Procurement queue
11. Vendors
12. Vendor detail
13. Budgets
14. Budget detail
15. Travel integration
16. Finance approval integration
17. Search
18. Command palette
19. Notifications
20. People integration
21. Work integration
22. Documents integration
23. Analytics integration
24. AI permission integration
25. Mobile Finance
26. Security
27. Audit
28. Accessibility
29. Performance
30. Exact palette verification
31. Light/dark QA
32. Visual QA
33. D13 backlog
```

---

# 76. D12 DELIVERABLES

```text
01. Finance Workspace
02. Finance Contextual Sidebar
03. Finance Home
04. Expense Management
05. Expense Detail
06. Expense Creation
07. Receipt Integration
08. Reimbursement Management
09. Purchase Requests
10. Procurement Queue
11. Vendor Management
12. Vendor Detail
13. Budget Foundation
14. Budget Detail
15. Travel Integration
16. Finance Approval Integration
17. Finance Search
18. Finance Commands
19. Finance Notifications
20. People Integration
21. Work Integration
22. Document Integration
23. Analytics Integration
24. AI Permission Integration
25. Mobile Finance
26. Permission UX
27. Security Verification
28. Audit
29. Accessibility Verification
30. Performance Verification
31. Exact Palette Verification
32. Light Mode Verification
33. Dark Mode Verification
34. D13 Backlog
```

---

# 77. D12 DEFINITION OF DONE

D12 is complete only when:

```text
Finance is a major Wamiro workspace.

The Rail switches into Finance.

The Sidebar shows only Finance features allowed for the user.

Expenses use one Wamiro expense system.

Reimbursements connect to expenses.

Purchase requests reuse D4.

Approvals reuse D4.

Receipts reuse D5 Documents.

Employees reuse D2 People.

Projects/tasks reuse D3 Work.

Finance analytics reuse D7.

AI respects Finance permissions.

Tenant isolation is verified.

Financial permissions are verified.

Exports are secure.

Sensitive payment data is protected.

Mobile expense/approval experiences work.

Audit is centralized.

Light mode uses only the approved palette.

Dark mode uses only the approved palette.

No gradients exist.

No unrelated application colors exist.

Finance looks like Wamiro, not a separate ERP.
```

---

# 78. AGENT EXECUTION RULE

The existing Wamiro application is already working.

Before implementation:

```text
Inspect existing finance functionality
↓
Inspect D4 Requests/Approvals
↓
Inspect D5 Documents
↓
Inspect D2 People
↓
Inspect D3 Work
↓
Inspect D7 Analytics
↓
Inspect D8 AI
```

Then:

```text
Implement
↓
Run
↓
Test financial permissions
↓
Test tenant isolation
↓
Test approval flow
↓
Test document permissions
↓
Test exports
↓
Test mobile
↓
Test light/dark
↓
Check exact palette
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

---

# 79. FINAL D12 PRINCIPLE

> **Finance should feel like another native Wamiro workspace, not an accounting application bolted onto the portal.**

The ideal connected flow is:

```text
Employee
↓
Expense
↓
Request
↓
Approval
↓
Reimbursement
↓
Analytics
```

without switching products.

---

# 80. FINAL D12 TARGET

The finished Finance experience should feel:

```text
Precise
Trustworthy
Dense
Structured
Permission-aware
Auditable
Fast
Enterprise-grade
```

with the exact same:

```text
Rail
Sidebar
Typography
Palette
Spacing
Tables
Forms
Dialogs
Workflows
Permissions
```

used throughout Wamiro.

---

# WAMIRO

> **One workplace. One operating system for your organization.**
