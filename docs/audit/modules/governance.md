# Module Excellence Checklist — Governance

Program: module-by-module industry-grade upgrade. Competitor grounding:
Vanta / Drata (risk heat map, control testing), Tugboat Logic (obligation
sweep, policy lifecycle), Hyperproof (evidence of testing), OneTrust
(policy register + versioning). Research note: web-search tool was
unavailable this session; patterns from established product knowledge.

## Already present (before this round)

- D15 service `src/modules/governance/service.ts` with policies,
  risks, controls, obligations, and the R8 idempotent overdue sweep
- API routes: `GET/POST/PATCH /api/v1/governance`, `POST /governance/sweep`
- Policy status workflow (draft → active → retired) with audit
- Risk impact/likelihood enums, mitigation text, status workflow
  (open → mitigated → accepted → closed)
- Control status (planned/partial/implemented) + result
  (pass/fail/not_tested) with lastTestedAt timestamp
- Obligation status (open/met) + escalatedAt + sweep that notifies
  governance.manage holders
- E2E proves policy create + status, risk status, control create + test
  result, obligation create + overdue sweep

## Improved this round

- **Dedicated `/governance` page** — D15 had a full API but no first-
  class UI surface; the page brings all four entity types into one
  workspace
- **Stats strip** — open risks (with high-severity count), controls
  (pass/fail tally), obligations (open + overdue), policies (active +
  draft)
- **Risk heat map** — 3×4 likelihood × impact grid, color-coded by
  composite score. Hover tooltip lists the risk titles. Hidden when
  no open risks exist (no empty grid)
- **Tabs** — one tab per entity type, with the count in the label
  (Obligations (n), Risks (n), …)
- **Inline create forms** — one per entity type, drawn from the same
  fields the API already accepts. No new schema
- **Inline status actions** — Mark met / Reopen on obligations;
  Mitigate / Accept / Reopen on risks; Pass / Fail on controls;
  Activate / Retire / Revive on policies
- **Due-date badge** on obligations — green (>14d), amber (≤14d),
  red (overdue) with a human-readable label
- **Run sweep button** in the header — admin-only, posts to
  `/api/v1/governance/sweep`. Idempotent; success pill shows
  "Sweep complete"
- **Score badge on risks** — composite impact × likelihood score
  with tone (≥9 red, ≥6 amber, else green) — pairs with the heat map
- **Risk mitigation snippet** — when a risk has a mitigation plan
  recorded, it renders below the row in a `bg-surface-subtle` block
  so reviewers don't have to open a detail page

## New this round

- **`setObligationStatus(ctx, id, status)` service** — closes the gap
  between the obligation lifecycle in the schema and the API. The
  service existed in spirit (`escalateOverdueObligations`) but there
  was no way for a user to mark an obligation met. Now there is
- **`bumpVersion` bug fix in `setPolicyStatus`** — the original code
  passed `(undefined as unknown as number)` as the new version,
  which was a no-op (and would have been a runtime error if the
  Drizzle type caught it). Now uses
  `sql\`${govPolicies.version} + 1\`` and includes the new version
  in the audit metadata
- **`OBLIGATION_STATUS_SET` audit action** — every status change is
  recorded
- **`kind: "obligation"` in the PATCH schema** — extends the PATCH
  union to include obligations

## Verification

- `npm run typecheck` clean
- `npm run lint` 0 errors (11 warnings, pre-existing)
- Full E2E: **59/60 passing** (no regression; the D15 policy / risk /
  control / obligation steps still green)
- Manual visual check: navigate to `/governance`, see the four stats,
  the heat map (if open risks exist), the obligations tab as the
  default with inline Mark met / Reopen, and the other three tabs
  rendering their own lists

## Backlog (not in this round)

- Policy version diff — when a policy is bumped, the prior version
  content is not snapshotted. Would need a `gov_policy_versions` table
- Control evidence upload — testers typically attach screenshots /
  exports; the controls table has no evidence column yet
- Risk treatment workflow — currently you can mark a risk mitigated
  or accepted, but there's no link to the controls that mitigate it
- Obligation ownership — `gov_obligations` has no `owner_user_id`;
  surfacing the owner is part of the D15 detail backlog
- Compliance framework mapping (e.g. SOC 2 / ISO 27001 controls) —
  a many-to-many from controls to framework requirements is a
  natural next step
- Native PDF export of a governance register for auditors
