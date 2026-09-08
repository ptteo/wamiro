# Wamiro — Administrator Guide

Everything a customer administrator needs to run their organization without
engineering help.

## Users

- **Invite**: Admin → Users or People → "Invite teammate". They get a 7-day
  link to set their own password (no password in email). If SMTP is off, copy
  the link from the confirmation. Managers can invite people onto their own
  team. Bulk CSV import is on Access Control (`name,email,role,manager_email`).
  `?legacy=1` on the admin invite API still returns a one-time password for
  one release.
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

## First week (Help, tour, sample data)

- **Help** (`/help`): short guides (clock in, leave, tickets) plus your knowledge articles. “Ask the assistant” uses the existing AI chat. “Contact support” opens a **platform** ticket — Wamiro operators see it, not your IT queue.
- **Replay tour**: Account menu or Help. First visit to Home, Attendance, Leave, Tickets, and Requests starts a short overlay (skip / next / Esc). State is stored in your preferences, per company.
- **Sample work**: on `/setup`, admins can load a demo project and sample tickets (`demo: true`). Purge removes only those rows for this company.
- **Email preferences**: Security → Email notifications. Turn kinds off, set quiet hours (email skipped, in-app kept), or a weekly unread digest. SMTP is `SMTP_URL` — see `docs/ops/smtp-dns.md` for SPF/DKIM/DMARC.

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

People, attendance, leave, payroll, and helpdesk are native Wamiro modules.
Optional connections:

- **SMTP** — invitations and notifications (`SMTP_URL`)
- **SSO / SCIM** — `/admin/security` when the org uses an identity provider
- **Email-to-ticket** — IMAP mailbox under Support settings (`SECRET_KEY` required in production)

## Backups & recovery

Operators handle infrastructure backups (see `deployment.md`). Your data-safety
levers inside the product are the audit trail and CSV exports — take an export
before large reorganizations.
