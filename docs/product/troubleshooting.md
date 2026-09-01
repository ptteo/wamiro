# Wamiro — Troubleshooting Guide

Quick answers for administrators. Anything you cannot resolve goes to
Support with the `request_id` from the error response.

## Sign-in problems

**"Incorrect email or password"** — passwords are case-sensitive; check Caps
Lock. Five bad attempts trigger a short lockout; wait a few minutes.

**MFA code rejected** — authenticator app time drift is the usual cause;
re-sync the app's time or re-enroll MFA from Settings → Security.

**"Account or organization suspended"** — an administrator must reactivate
the user (Admin → Users → select user → Reactivate) or lift the
organization suspension.

## Access problems

**Workspace missing from the left rail** — modules are enabled/disabled per
organization (Admin → Organization settings). If the module is on but you
still don't see it, you lack its permission; ask an admin to review your
roles (Admin → Roles).

**403 on an action you could do yesterday** — permissions changed. Admin →
Audit shows who changed what and when.

## Data problems

**Document won't upload** — check file size limits with your operator and
that storage credentials are configured. Errors surface as "Upload failed"
with a retry button.

**Export returns empty CSV** — exports respect permissions: you need the
dataset's view/manage permission (e.g. attendance export needs company-wide
attendance visibility).

## Operational problems

**Slow pages** — check `/api/v1/health/ready` first. If degraded, the
database is the bottleneck; contact your operator with the timestamp.

**Emails not arriving** — SMTP misconfiguration; invitations fail silently
to spam otherwise. Verify with your mail provider's logs.

**Something broke after an update** — operators roll back by redeploying the
previous release tag; migrations are designed so older code runs safely on a
newer schema. Report the `request_id` of failing calls either way.

## Where to look deeper

- `/admin/audit` — every administrative action with actor, entity, before/after
- Structured JSON logs (operators) — grep by `request_id`
- `/api/v1/health/ready` — component statuses + version
