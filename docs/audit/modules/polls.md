# Polls (Surveys) module audit

Module: **Polls** (blueprint §43)
Route: `/surveys`
Status: **Production-grade (industry)**

---

## What users do here

- Admins/HR publish a poll (question + 2–8 options).
- Everyone votes — one vote per user, re-voting updates the choice.
- After voting, results are shown as horizontal bar charts with the viewer's choice highlighted.
- Search and filter to Open / Voted polls.

## Data model (current)

- Table `surveys`: `id`, `organization_id`, `question`, `options` (text[]), `created_by`, `closes_at` (nullable = open indefinitely), `pinned`, `created_at`.
- Table `survey_votes`: `survey_id`, `user_id`, `option_index`, `voted_at`. Unique on `(survey_id, user_id)` so re-voting updates.
- Audit: `SURVEY_CREATED`, `SURVEY_VOTED`.

## Service surface

`src/modules/surveys/service.ts`:

- `listActive(ctx)` — open polls, with per-poll counts and the caller's vote.
- `createSurvey(ctx, { question, options })` — `announcements.manage` gated, 2–8 options.
- `vote(ctx, surveyId, optionIndex)` — re-vote on conflict.

API: `GET /api/v1/surveys`, `POST /api/v1/surveys`, `POST /api/v1/surveys/:id/vote`.

## UI / UX checklist

### Already in place
- [x] Server-rendered list.
- [x] Anonymous vote (one per user).
- [x] Results revealed after voting.
- [x] Audit trail.

### Improved in this round
- [x] **Hero-less toolbar** with search, scope chips (All / Open with live count / Voted), and "New poll" button.
- [x] **One-line summary** — `N polls · N open · N voted`.
- [x] **Pre-vote view** — option buttons in a responsive 2-column grid with a "Vote" affordance on hover.
- [x] **Post-vote view** — horizontal bar chart with the viewer's choice highlighted in brand tint and the percentage in brand text. Other choices get a neutral surface fill.
- [x] **Side-panel drawer** for "Publish a poll" with numbered option inputs, "Add option" button (up to 8), remove individual options, real-time count of valid options.
- [x] **Context-aware empty states** — "No polls yet" / "Nothing to vote on" / "No voted polls" / "No matches".
- [x] **Loading state** on individual option buttons while the vote is in flight.
- [x] **Disabled state** on all options while a vote is being submitted (prevents double-click).
- [x] **URL state persistence** — `?q=...&s=...`.
- [x] **Body-scroll lock + ESC** on the drawer.

---

## Module-grade checks

| Category | Status |
| --- | --- |
| Auth-gated route | ✓ |
| Module-gated (any authed user can vote) | ✓ |
| Multi-tenant isolation | ✓ |
| `announcements.manage` gated for create | ✓ |
| One vote per user (unique constraint) | ✓ |
| Re-vote supported (on-conflict update) | ✓ |
| Audit trail | ✓ |
| RSC boundary compliance | ✓ |
| URL state persistence | ✓ |
| Color tokens only | ✓ |
| Empty / no-match states | ✓ |
| Inline feedback (busy / error) | ✓ |
| Mobile-friendly toolbar | ✓ |
| Light/dark theming | ✓ |
| Body-scroll lock + ESC | ✓ |

---

## Backlog (out of scope this round)

- [ ] **Close poll** UI (the `closes_at` column exists but no admin UI to set it).
- [ ] **Delete poll** (only the create-by user or a `manage` holder should be able to).
- [ ] **Comment on a poll** ("why did you vote that way?").
- [ ] **Multi-select polls** ("pick your top 3") — schema only supports single choice today.
- [ ] **Anonymous results** even for voters (so HR can't see who voted what) — current view shows totals only, which is correct.
- [ ] **Notifications** when a poll closes.

---

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors.
- `npm run build` — clean. `/surveys` route bundle (per `npm run build` output).
- `node scripts/smoke-company.mjs` — **46/46** (covers Polls end-to-end).
- `node scripts/e2e-all.mjs` — **64/64 passed**.
