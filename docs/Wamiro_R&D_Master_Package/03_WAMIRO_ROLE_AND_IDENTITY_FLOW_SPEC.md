
# WAMIRO — ROLE & IDENTITY FLOW SPEC
## Mandatory Product Behavior

---

# 1. USER IDENTITY IS GLOBAL

A human has one Wamiro identity where practical.

Example:

```text
User
  id
  email
  auth_identity
```

Company-specific information lives in membership.

---

# 2. MEMBERSHIP

```text
OrganizationMembership
  user_id
  organization_id
  employment_id
  status
  joined_at
  invited_by
```

A user can have many memberships.

---

# 3. ROLE ASSIGNMENT

```text
RoleAssignment
  membership_id
  role_id
  scope_type
  scope_id
  starts_at
  expires_at
  reason
```

Examples:

```text
CEO / Organization
Manager / Department: Engineering
Reviewer / Team: Security
Finance Manager / Department: Finance
```

---

# 4. EFFECTIVE ACCESS

Calculate:

```text
user
+
membership
+
roles
+
scope
+
resource
+
conditions
+
temporary grants
-
explicit denies
```

and produce:

```text
effective_permissions
```

---

# 5. ACTIVE CONTEXT

Every authenticated application session has an active context:

```text
organization
membership
effective role set
scope
workspace
```

The UI must expose at least:

```text
organization
current user
current role/scope
```

where ambiguity is possible.

---

# 6. MULTI-COMPANY UX

If user belongs to several organizations:

```text
[Company A ▼]
```

Click:

```text
Your organizations
Company A
Company B
Company C
```

Switching company performs a fresh server-authorized tenant transition.

---

# 7. ROLE DISPLAY

Employee:

```text
Acme Technologies
Rahul Sharma
Employee
```

Manager:

```text
Acme Technologies
Rahul Sharma
Manager · Engineering
```

HR:

```text
Acme Technologies
Rahul Sharma
HR Admin
```

CEO:

```text
Acme Technologies
Rahul Sharma
CEO
```

Admin:

```text
Wamiro Platform
Platform Admin
```

Do not expose sensitive permission internals to normal users.

---

# 8. ROLE-BASED HOME

Home modules must be generated from:

```text
role
scope
tenant modules
permissions
personal preferences
```

Not from:

```text
if email === ...
```

or:

```text
if user.id === ...
```

---

# 9. DEPARTMENT CONTEXT

When a user is operating inside a department context:

```text
Engineering
```

team-scoped content must remain there unless the user has broader scope.

---

# 10. ROLE CHANGE

When role changes:

```text
invalidate permission cache
invalidate navigation cache
recalculate effective access
refresh home
refresh search scope
refresh AI context
audit change
```

---

# 11. DEPARTMENT TRANSFER

When department changes:

```text
manager
team
scope
approval routing
dashboard
notifications
workflow
```

must be reevaluated.

---

# 12. SESSION CHANGE

If authorization is revoked while logged in:

```text
API rejects access
↓
client receives authorization change
↓
stale data is removed
↓
navigation refreshes
↓
user is redirected where necessary
```

Never keep showing stale sensitive data after revocation.

---

# 13. PERSONAL SETTINGS

Per-user:

```text
theme
language
timezone
density
default workspace
favorites
saved views
dashboard layout
notification settings
keyboard preferences
accessibility preferences
```

---

# 14. TENANT-SCOPED SETTINGS

Separate:

```text
company default theme
company default timezone
company default language
company default landing experience
company notification policies
```

from personal settings.

---

# 15. DEFAULT PRECEDENCE

```text
System
↓
Tenant
↓
Role
↓
User
```

Security and authorization override presentation preferences.

---

# 16. ACCEPTANCE TEST

For four accounts:

```text
CEO
HR
Manager
Employee
```

the reviewer must be able to identify:

```text
who they are
which company
which role
which scope
what they can do
what they cannot do
```

without opening the Admin panel.

