
# WAMIRO — 100-COMPANY END-TO-END TEST MATRIX
## Multi-Tenant / Multi-Role / Multi-Department / Failure / Security Scenarios

---

# 1. PURPOSE

Before selling Wamiro to 100 organizations, simulate the product with many different organizational shapes.

Target:

```text
100 customer tenants
+
many role combinations
+
many department structures
+
many module configurations
```

---

# 2. TENANT SCENARIOS

## T01 — Small startup

```text
10 users
2 departments
HR + Work
```

## T02 — SMB

```text
50 users
5 departments
HR + Work + Knowledge
```

## T03 — Medium company

```text
250 users
10 departments
full core modules
```

## T04 — Enterprise

```text
1,000+ users
20+ departments
multi-location
```

## T05 — Large enterprise

```text
10,000 users
multi-region
multi-legal-entity
```

Repeat variations until:

```text
T01–T100
```

cover all major combinations.

---

# 3. ROLE SCENARIOS

Every tenant should include combinations of:

```text
Employee
Manager
Department Admin
HR Admin
Finance
IT
Executive
Tenant Admin
Custom Role
```

---

# 4. MULTI-COMPANY USER SCENARIOS

Test:

```text
same email
same person
multiple organizations
different roles
different permissions
different default workspaces
different notification preferences
```

---

# 5. DEPARTMENT SCENARIOS

Test:

```text
no department
one department
multiple teams
multiple departments
matrix team
temporary department
department transfer
```

---

# 6. ROLE CHANGE SCENARIOS

Test:

```text
Employee → Manager
Manager → Employee
Manager → Department Admin
HR → Executive
Executive → Admin
Custom Role → Manager
```

Every change must recalculate access.

---

# 7. MODULE SCENARIOS

Test tenants with:

```text
HR only
Work only
Knowledge only
HR + Work
HR + Finance
HR + IT
full modules
minimal modules
custom modules
```

Disabled modules must be inaccessible.

---

# 8. PERMISSION SCENARIOS

Test:

```text
Self
Team
Department
Company
Global
Explicit Deny
Temporary Access
Delegation
Expired Access
Revoked Access
```

---

# 9. COMPANY LIFECYCLE

Test:

```text
signup
setup
invite
activate
configure
use
upgrade architecture later
suspend
recover
export
deprovision
```

---

# 10. USER LIFECYCLE

Test:

```text
invited
accepted
active
suspended
role changed
department changed
leave
offboarding
reactivation
deleted/deprovisioned
```

---

# 11. CORE E2E

For every tenant:

```text
login
home
search
command palette
people
work
requests
knowledge
documents
support
analytics
AI
admin
logout
```

Where a tenant has the module.

---

# 12. WORKFLOW TESTS

Test:

```text
request
validation
approval
rejection
delegation
timeout
escalation
retry
completion
audit
notification
```

---

# 13. INTEGRATION FAILURES

Simulate:

```text
HR offline
Project provider offline
ITSM offline
Document provider offline
Analytics unavailable
AI unavailable
calendar unavailable
search unavailable
email unavailable
```

Wamiro should degrade gracefully.

---

# 14. CONCURRENCY

Test:

```text
two admins edit same user
two managers approve same request
employee submits duplicate request
two people book same room
two integrations update same record
two workers process same event
```

---

# 15. NETWORK FAILURE

Interrupt:

```text
save
upload
approval
booking
search
AI
```

Verify:

```text
no duplicate mutation
no data loss
retry behavior
user feedback
```

---

# 16. SECURITY TESTS

Test:

```text
IDOR
privilege escalation
cross-tenant object access
cross-tenant search
document leakage
download leakage
export leakage
AI leakage
session reuse after revoke
expired permission access
```

---

# 17. SEARCH SECURITY

Every query must be evaluated as:

```text
tenant
+
identity
+
permissions
+
scope
```

Test with identical search terms across two tenants.

---

# 18. AI SECURITY

Test:

```text
prompt attempts to reveal hidden data
cross-tenant retrieval
restricted employee fields
restricted documents
restricted analytics
restricted admin configuration
tool abuse
```

The AI must fail safely.

---

# 19. FILE SECURITY

Test:

```text
direct object URL
expired URL
revoked permission
shared file
deleted file
tenant switch
```

---

# 20. AUDIT TEST

Verify important actions create correct audit events.

Check:

```text
actor
tenant
action
resource
timestamp
result
old value where appropriate
new value where appropriate
```

---

# 21. BACKUP/RESTORE

For representative tenants:

```text
backup
restore
verify users
verify memberships
verify roles
verify documents
verify workflows
verify integrations
verify audit
```

---

# 22. PERFORMANCE TESTS

Simulate:

```text
100 tenants
1,000 active concurrent users
large table
large search index
large audit log
large notification queue
large workflow queue
```

Measure:

```text
p95
p99
error rate
queue latency
database latency
```

---

# 23. MOBILE TESTS

Test every role on:

```text
390px
430px
tablet
desktop
```

Themes:

```text
light
dark
```

---

# 24. ACCESSIBILITY TESTS

Test:

```text
keyboard only
screen reader
high zoom
reduced motion
long text
RTL where enabled
```

---

# 25. ACCEPTANCE CONDITION

A product area is releasable only if:

```text
happy path
+
authorization
+
tenant isolation
+
failure path
+
recovery
+
audit
+
mobile
+
accessibility
```

have evidence.

---

# 26. FINAL 100-TENANT RELEASE GATE

Do not declare "100 companies ready" until:

```text
all P0 scenarios pass
all core P1 scenarios pass
no cross-tenant leaks
no privilege escalation
no critical data corruption
no unrecoverable workflow
no critical migration issue
no critical mobile regression
no critical accessibility regression
```

