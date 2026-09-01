# Wamiro — Administrator Guide

Everything a customer administrator needs to run their organization without
engineering help.

## Users

- **Invite**: Admin → Access Control → "Invite user". They receive an email
  with a temporary password (shown once to you).
- **Suspend / reactivate**: user detail page (`/admin/users/:id`). Suspension
  immediately revokes all their sessions and blocks sign-in.
- **Sessions**: see every active session per user; revoke one device or all.

## Roles & permissions

- Roles bundle permissions at a scope: SELF, TEAM, DEPARTMENT, COMPANY, GLOBAL.
- `/admin/roles` lists roles with member counts; the detail page shows the
  exact permission set grouped by family, plus holders.
- Overrides grant or deny a single permission for one user, optionally
  time-boxed. Deny always wins; overrides beat role grants.
- Delegation: approvers can delegate approvals while away (Approvals →
  Delegations). Delegated approvals are audited with both identities.

## Modules & workspaces

- Enable/disable modules in Organization settings. A disabled module loses its
  rail entry, sidebar, routes AND APIs — typing the URL directly does not work.
- The rail is fixed (Home, People, Work, Requests, Knowledge, Documents,
  Company, Assets, Analytics, AI, Admin); what appears depends on modules +
  permissions.

## Security center

`/admin/security` shows authentication settings, MFA adoption, SSO status,
all tenant sessions (with revocation), security events and integration state.

## Audit

`/admin/audit` is the system of record: actor, action, entity, before/after
values, IP, timestamp. Filter by text or action; export to CSV from the Admin
home page. Retain per your compliance policy — rows are never rewritten.

## Data export

Admin → Data export: employees, attendance, leave, audit as CSV. Every export
is itself audited. Exports respect permissions and tenant boundaries by
construction.

## Integrations

Frappe HR sync pulls the employee master into the directory. Status and last
sync are on the Admin home page. A failed sync leaves existing data intact —
fix credentials and retry.

## Backups & recovery

Operators handle infrastructure backups (see `deployment.md`). Your data-safety
levers inside the product are the audit trail and CSV exports — take an export
before large reorganizations.
