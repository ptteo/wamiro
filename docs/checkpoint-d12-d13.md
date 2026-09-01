# Checkpoint — D12 + D13 implementation

## UI library integration (master instruction, this round)
- Installed: `@floating-ui/react@0.27`, `react-aria-components@1.20`, `@radix-ui/themes@3.3` (scoped CSS, inert until `<Theme>` mounted). Reka = reference only; Headless deferred (RAC covers it — avoids dual dialog vendor per §67).
- New `src/components/ui-overlays.tsx`: Wamiro Tooltip/Popover/Menu/Dialog/ConfirmDialog. Floating UI does offset+flip+shift+autoUpdate (§19-20); RAC Modal traps/restores focus (§36); destructive confirm has Cancel default + explicit copy (§37).
- Tokens pinned to approved palette in `globals.css`: tertiary #7A7A7A; success/info → typographic-neutral ink (#242424/#383838 light, #F8F8F8/#AFAFAF dark) since green/blue are not in the 10-hex palette; danger stays #C23838; warning shares brand hue; `[data-theme="dark"]` alias added (§10); z-scale (--z-sticky…--z-toast) + motion durations (§61/63).
- `ui.tsx`: Badge success tone now inverted ink chip; added Button (loading keeps width §47), PageHeader (sticky-capable §60), dense Table/THead/Th/Tr/Td (40px rows, sticky header, right-aligned tabular numerals §34/35).
- Verified: typecheck clean · lint 0 errors · production build GREEN.
- Staged rollout next: migrate screens onto Button/PageHeader/Table, adopt Radix Theme provider behind wrappers where a visual primitive is justified, Combobox via React Aria for all entity selectors (§29), one Calendar via RAC (§31-32).

---

# Original D12/D13 notes below

Verified: lint 0 errors · typecheck clean · unit 14/14 · **migration-0026 applied to live RDS** (18 new tables + role backfills) · production build GREEN.

## D12 — Finance & procurement
Built: `finance` module key; tables vendors/vendor_documents/budgets/expenses/purchase_requests/travel_requests; service `src/modules/finance/service.ts` (scoped lists, submit/approve/reject/reimburse/cancel, purchase order→received flow, travel decisions, budget charging on approve/reimburse, home aggregates incl. ≥80% budget warnings); APIs `/api/v1/finance/{expenses,purchases,travel,vendors,budgets}` (+[id]); pages `/finance` (home+warnings), expenses list/detail w/ create form, purchases queue, travel, vendors list/detail (status set + document records), budgets with progress bars, approval center; Finance rail workspace with permission-aware sidebar; global search returns vendors.
Spec mapping: §3-5 workspace/sidebar/home ✓ · §10-17 expense lifecycle ✓ (reimbursement = status on expense) · §18-22 purchase/procurement queues ✓ · §23-26 vendors ✓ (docs = metadata records, no upload plumbing — honest gap vs D5 upload reuse) · §27-30 budgets + warnings + request→budget charging ✓ · §31-33 travel ✓ · §34 approvals ✓ · §35 search ✓ · §38-40 currency per row (no FX conversion — honest gap) · §41 audit events ✓ · §43 scopes SELF/team/company ✓ · §45 export dataset NOT added (gap) · §36 saved views / §52 AI context not wired (gaps).
## D13 — People ops
Built: tables job_openings/candidates/candidate_events/journeys/journey_items/review_cycles/review_entries/courses/course_enrollments/recognitions/job_changes/profile_change_requests; service `src/modules/people-ops/service.ts`; APIs `/api/v1/people-ops/{jobs,candidates[+id],journeys[+id],reviews[+id],learning[+id],recognitions,hr-changes}`; pages `/people/recruitment` (pipeline counts+jobs+candidates), candidate detail (stage moves + notes/interviews/offers timeline), `/people/lifecycle?kind=` onboarding/offboarding journeys with default templates and checklists, `/people/performance` (cycles seeded per employee, self/manager/finalize), `/people/learning`, `/people/recognition`, `/people/me` (self-service change requests §7-8 + lifecycle timeline §41); permissions group "People Ops" wired into hr_admin template + existing-tenant backfill; search returns candidates.
Reused per §2 absolute rule: single IAM engine, audit, notifications, documents/knowledge links by reference — no duplicate engines.
Gaps (honest): manager review UI is via entry-id paste form (no per-entry page); training assignment to arbitrary users via API only; engagement analytics §39 not built; pulse surveys reuse existing surveys module (not re-surfaced); mobile-specific layouts follow existing responsive shell only.

## Verification
```
node scripts/migrate.mjs   # 124/124 ok (after role_permissions.id fix)
npm run lint               # 0 errors
npm test                   # 14/14 pass
npm run build              # green, 60 routes
```
Cross-tenant isolation suite not yet extended to the 18 new tables — recommended next step before production launch of these modules.
