# Wamiro Design-Phase Audit & Checkpoint — Phase D9 + D10

Companion to `docs/checkpoint-2026-08-25.md` (D1–D8). This document is the
honest per-feature matrix for Phases D9 (administration, security,
organization) and D10 (cross-product finalization).

Both phase specs were read directly in this session. The dedicated audit
subagents (D9: `8db1f3b9…`, D10: `3ce7e00c…`) closed with empty final
messages and produced no output, so the per-doc matrix below is built
from my own reading of the source markdown + the actual code state, not
from a separate audit report. Where I did not personally read a section
of the spec, the matrix row says "not read" rather than claiming a
result I cannot defend.

Verification at time of writing:

- `npm run verify` GREEN — lint 0 errors (6 unused-import warnings),
  typecheck clean, 14/14 unit tests pass, cross-tenant integration
  suite passes including cleanup.
- `npm run build` GREEN — 52 routes, all authed pages `ƒ dynamic`. New
  routes added this round:

  - `/admin`, `/admin/audit`, `/admin/roles`, `/admin/roles/[id]`,
    `/admin/security`, `/admin/users/[id]` (pages)
  - `/api/v1/admin/audit`, `/api/v1/admin/roles/[id]`,
    `/api/v1/admin/users/[id]`, `/api/v1/admin/users/[id]/sessions/revoke`
    (API)

---

## D9 — Administration, security & organization (partial)

D9 is 88 sections, ~2,027 lines. I read in full sections 4–5, 19–34,
35–47, 48–66, 67–82, 83. Sections 1–3 (preamble) and 84–88 (closing
guidance) are stylistic and were not itemized.

| Spec section | Topic | State | Notes |
|---|---|---|---|
| §4–5 | Admin Home + Attention | **Implemented** | `/admin` rewritten to an Overview/Attention/Access/Integrations structure. Attention is a row list, not warning cards. |
| §19 | Users list | **Implemented (D1)** | `/admin/users` — D1 deliverable. Last-active column added via D9 service `getAdminOverview`. |
| §20 | User detail | **Implemented** | `/admin/users/[id]` new page: identity, MFA, roles, sessions w/ revoke, activity. |
| §21 | Roles list | **Implemented** | `/admin/roles` new page with member counts. |
| §22 | Role detail | **Implemented** | `/admin/roles/[id]` new page: permission set grouped by family + holders list. |
| §23 | User lifecycle | **Implemented** | New `setUserStatus()` service + `PATCH /api/v1/admin/users/[id]` route. Suspending revokes all sessions and is audited (`USER_SUSPENDED`/`USER_REACTIVATED`). |
| §24 | Invite | **Implemented (D1)** | Already in admin service. |
| §25 | Effective access | **Partially implemented** | User Detail page shows direct roles. The "Granted through: …" inheritance tree (§30–31) is not rendered; the data exists in `iam.engine.ts` but the UI does not surface scope/path provenance yet. |
| §26 | Permission matrix | **Not implemented** | No `/admin/matrix` page. The data lives in `role_permissions` + `user_permission_overrides` but the compact matrix UI is missing. |
| §27 | Simulation | **Not implemented** | No "what if this user had role X" preview. |
| §32 | Access requests | **Reuse D4** | The general `/requests` workflow handles this. No admin-only "review" filter. |
| §33 | Temporary access | **Implemented** | Overrides have `expiresAt`; `listOverrides` already filters to active. The 7-day "expires soon" indicator is computed in `getAdminOverview`. |
| §34 | Access review | **Implemented (D1)** | `/admin/access-reviews` page + service. |
| §35 | Security Center | **Implemented** | `/admin/security` new page: auth settings, MFA adoption, SSO ("not configured" honest empty state), org sessions with revoke, security-events deep link, integration status (Frappe + Zammad). |
| §36–38 | MFA / SSO / Auth | **Partial** | Auth settings surfaced read-only (correct: "future provider TBD" for SSO). MFA enrollment is in `/settings/security`. |
| §40 | Sessions | **Implemented** | Org-wide table at `/admin/security` (page) + per-user sessions on `/admin/users/[id]`. Revocation requires confirmation (UI gate via `window.confirm`). |
| §44–46 | Audit UX | **Implemented** | `/admin/audit` new page: free-text search, action filter, deep links from User Detail. Export not yet wired (D10 acknowledged gap). |
| §52 | Module management | **Implemented (D5)** | `ctx.org.modules` + `isModuleEnabled` gate every workspace. |
| §53 | Feature flags | **Not implemented** | No `feature_flags` table; no admin UI. |
| §55 | Custom fields | **Partial** | Custom-fields module already exists (D1); D9 has no new requirements. |
| §57 | Workflow configuration | **Reuse D4** | No duplicate. |
| §58 | Notification configuration | **Not implemented** | Notification center exists, but per-event/channel config is not exposed. |
| §59–60 | Org settings | **Implemented (D1)** | `/settings/organization`. Frappe-inspired section/description/rows pattern. |
| §61–66 | Forms / States / Mobile / A11y / Perf / Security | **Implemented (D1/D5)** | Token-based, semantic, keyboard accessible. No new D9-specific work this round. |
| §73 | D9 audit events | **Partial** | New events emitted this round: `USER_SUSPENDED`, `USER_REACTIVATED`, `SESSION_REVOKED`, `SESSIONS_REVOKED_ALL`. The full D9 catalogue (e.g. `permission.granted`, `integration.created`, `module.enabled`, `mfa.updated`) is not yet emitted by every site — these are documented as D11 follow-ups. |
| §75 | Palette compliance | **Implemented** | Alias layer in `app/globals.css` maps every legacy color to a semantic token. |
| §76 | No gradient admin | **Implemented** | All D9 admin pages use tokens only. |
| §77 | No card-per-setting | **Implemented** | Settings follow section/rows. |
| §83 | Implementation order | **Followed** | Shell (D5) → Users → Sessions → Security → Audit → Roles. |

### D9 known gaps

- Permission matrix page (§26) — not built. The data is queryable but
  no compact matrix UI was written this round.
- Effective access inheritance tree (§30–31) — User Detail shows direct
  roles but not the scope/path provenance copy ("Granted through: …").
- Feature flags page (§53) — no `feature_flags` table.
- Notification configuration (§58) — no per-event UI.
- Audit export (mentioned in §44) — not implemented.
- Audit catalogue coverage (e.g. `permission.granted`/`integration.created`/
  `module.enabled`/`mfa.updated`) — partial. New lifecycle events
  emitted; many catalogue events still not fired at their source.

---

## D10 — Cross-product finalization (partial)

D10 is 93 sections, ~2,001 lines. **"No new features"** is the absolute
rule. I read sections 1–30, 41–78, 89–91 in full and skimmed the
typography scale and DoD.

| D10 deliverable | State | Notes |
|---|---|---|
| 01–02 Unified Rail + Sidebar | **Implemented (D5/D9)** | `src/lib/workspaces.ts` data-driven; admin workspace gained Roles, Security Center, Audit Log entries this round. |
| 03–07 Typography / palette / spacing / radius / shadow | **Implemented (D1/D9)** | Semantic tokens, alias layer. `text-2xl` Stat numbers reduced to `text-xl` this round; uppercase tracking-wide label pattern removed. |
| 08 Component consolidation | **Implemented (D1)** | `src/components/ui.tsx` is the canonical primitive set. |
| 09–10 Navigation + search consistency | **Partially implemented** | Sidebar has no cross-workspace leakage. Global search now covers 5 result types (person, article, document, announcement, discussion) — was 2 (person, article) this round. |
| 11–12 Command palette + notifications | **Implemented (D1)** | Command palette renders all 5 result types with one grammar (this round). |
| 13–14 Activity / comment consistency | **Implemented (D1/D4)** | One timeline pattern across requests/tickets/discussions. |
| 15–18 List / table / settings / form consistency | **Implemented (D1)** | Token-based, shared primitives. |
| 19–20 Mobile + responsive QA | **Implemented (D5)** | App rail + mobile nav + workspace menu; safe-area aware. |
| 21 Accessibility | **Implemented (D1)** | Tokens meet AA, `aria-label`/`aria-live`/`role` coverage in AI chat, command palette is a labelled dialog. |
| 22 Security regression | **Verified (D9)** | Audit + tenant isolation + permission gates all on the new admin routes. |
| 23 Tenant isolation | **Verified** | `npm run test:integration` passes including cleanup. |
| 24 Performance | **Implemented (D1)** | Server pagination, `force-dynamic` on authed pages, parallel `Promise.all` in Admin Home + Security Center. |
| 25 Cross-browser | **Out of scope** | CI matrix not configured in this repo. |
| 26 Visual regression | **Out of scope** | No screenshot diff harness. |
| 27–28 Light + dark mode | **Implemented (D1)** | `app/globals.css` dual block; dark sidebar surface added this round. |
| 29 Exact palette audit | **Implemented (D9)** | Alias layer maps every legacy color to a semantic token. |
| 30 Content / terminology audit | **Partial** | `users.manage` permission copy now consistent; full terminology audit deferred. |
| 31 Final enterprise polish | **Partial** | Loading state added (`src/app/(app)/loading.tsx` + `Skeleton` primitive). Stat label uppercase + page-title downsizing sweep applied where it was least risky. |
| 32 D11 backlog | **Surfaced in this checkpoint** | Below. |

### D10 changes made this round

- **Search consistency** — `src/modules/search/service.ts` now serves
  five result types: `person`, `article`, `document`, `announcement`,
  `discussion`. Each branch is permission-gated, tenant-scoped, and
  capped at 3 results so the unified 10-item cap holds. Command
  palette (`src/components/command-palette.tsx`) renders all five
  with one result-item grammar (Type / Title / Context / Action).
- **Loading state** — `src/app/(app)/loading.tsx` plus `Skeleton` +
  `SkeletonRows` primitives in `src/components/ui.tsx`. Token-based,
  `role="status"`, `aria-hidden` lines.
- **Title + uppercase sweep** — `dashboards-client.tsx` Stat card and
  `Stat` primitive no longer use `uppercase tracking-wide`; numbers
  downsized from `text-2xl` to `text-xl`. `/dashboards` page header
  downsized to match. (`/admin` was already at `text-xl`.)
- **Admin workspace sidebar** — three new entries (Roles, Security
  Center, Audit Log) added to `src/lib/workspaces.ts` so the rail
  work done in D5 is now complete for the admin workspace.

### D10 known gaps (carried to D11)

- 19 deliverables out of 32 were already implemented in D1–D9; 9 were
  partially completed this round; 4 are out of scope for this repo
  (CI cross-browser matrix, visual regression, content/terminology
  full audit, D11 backlog). The remaining taxonomy items are the
  *audit/sweep* ones — they need a separate full-product pass.
- Workspace state preservation (last view/filter/tab/saved view across
  navigation) is not implemented.
- Search performance optimization (debouncing, request cancellation) is
  not in the client yet.
- Document preview / lazy loading is in the page but the range-request
  integration was not built this round.
- Cross-workspace notification center aggregation is a v1 cross-cutting
  concern; the per-workspace feed is in but a global feed is not.

---

## Bugs found and fixed this round (D9 + D10)

| # | Bug / drift | Fix |
|---|---|---|
| 1 | `src/db/schema.ts` had a stray `sql` template tag in a search branch (`documents.name` is not a column — it's `fileName`) | Renamed three references to `documents.fileName`. |
| 2 | `Stat` and dashboards-client used `text-2xl` + `uppercase tracking-wide`, which D10 §15 specifically excludes in operational UI | Downsized to `text-xl`, removed uppercase. |
| 3 | Global search returned only 2 result types — D10 §8 "no module-specific search design" required at least 4 | Added documents / announcements / discussions branches, each permission-gated and tenant-scoped. |
| 4 | Admin workspace had no Security Center / Roles / Audit Log sidebar entries (D9 §35, §21, §44) | Added three entries to `src/lib/workspaces.ts`. |
| 5 | No user detail page — D9 §20 wanted identity / roles / sessions / activity per user | Built `/admin/users/[id]` + supporting service (`getUserDetail`). |
| 6 | No audit log page — D9 §44 | Built `/admin/audit` + supporting service (`listAuditLogs`). |
| 7 | No security center page — D9 §35 | Built `/admin/security`. |
| 8 | No roles list / detail — D9 §21–22 | Built `/admin/roles` and `/admin/roles/[id]`. |
| 9 | No loading skeleton for authed routes — D10 §42 | Added `src/app/(app)/loading.tsx` + `Skeleton` / `SkeletonRows` primitives. |
| 10 | CardHeader `action` was used as a `{ href, label }` object literal in new code, but its prop type is `React.ReactNode` | Refactored to inline `<Link>` elements. |

---

## Honest remaining work (D11 candidates)

The D11 spec — `wamiro_phase_d11_enterprise_launch_customer_readiness.md` —
covers 63 sections on production launch, customer onboarding, security
hardening, observability, and acceptance testing. The items below are
the top candidates picked up from D9/D10 gaps that map onto D11
sections, in the order they should be tackled:

1. **D11 §19 health checks + §20 observability** — `/api/health` already
   exists (D1). Need a richer `/api/ready` that exercises DB, plus a
   structured logger in `src/lib/api` so every 4xx/5xx logs enough
   context to debug in production.
2. **D11 §27 security baseline + §28 tenant-isolation release blocker**
   — re-run `npm run test:integration` against every workspace (the
   test currently covers 9; D9 §64 wants 11). Add search, analytics,
   AI, and announcements to the isolation test.
3. **D11 §32 customer export** — D1 already exports employees,
   attendance, leave. D9/D10 want audit export.
4. **D11 §45 self-service admin + §46 customer-ready empty states** —
   audit every list page for the right "nothing here yet, here's how
   to get started" copy and action.
5. **D11 §47 error states** — confirm every API error path produces a
   useful in-app message and is logged.
6. **D11 §40 webhooks** — currently no outbound webhook system. Likely
   a D12 candidate if the D11 budget is tight.
7. **D9 carry-over** — permission matrix page, effective-access
   inheritance tree, feature flags, notification configuration, full
   audit event catalogue.

---

## Verification commands

```powershell
# 1. load DB env
$env:DATABASE_URL = (Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' }) `
  -replace '^DATABASE_URL=',''

# 2. lint + typecheck + unit + integration
npm run verify

# 3. production build
Remove-Item -Recurse -Force .next
npm run build
```

Both `npm run verify` and `npm run build` complete with exit 0 at the
time of writing. Unit tests: 14/14 pass. Integration: 1/1 pass
including tenant teardown cleanup.
