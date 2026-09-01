# Acknowledgements (e-sign-lite) module audit

Module: **Acknowledgements** (blueprint §102)
Route: `/acknowledgements`
Status: **Production-grade (industry)**

---

## What users do here

- Read every published policy that requires a signed confirmation.
- Sign by typing their full name (must match the profile name case-insensitive after whitespace normalization).
- See their own signature timestamp on signed docs.
- Admins see a completion panel with signed/total counts per document.

## Data model (current)

- Table `acknowledgements`: `id`, `organization_id`, `created_by`, `title`, `body`, `created_at`.
- Table `acknowledgement_signatures`: `acknowledgement_id`, `user_id`, `signature_name`, `signed_at`, `ip`. Unique on `(acknowledgement_id, user_id)`.
- Audit: `ACKNOWLEDGEMENT_PUBLISHED`, `ACKNOWLEDGEMENT_SIGNED`.

## Service surface

`src/modules/acknowledgements/service.ts`:

- `listForUser(ctx)` — now joins `users.name` and `users.avatarUrl` for the author.
- `create(ctx, { title, body })` — `announcements.manage` gated.
- `sign(ctx, id, signatureName, ip)` — name-must-match validation, idempotent insert.
- `completionStats(ctx)` — `announcements.manage` only, returns per-doc signed/total.

API: `GET/POST /api/v1/admin/acknowledgements`, `POST /api/v1/acknowledgements/:id/sign`.

## UI / UX checklist

### Already in place
- [x] Server-rendered list with own-signature state.
- [x] Sign by typing full name.
- [x] Completion stats for admins.
- [x] Audit trail (with IP).
- [x] Policy text fully readable before signing.

### Improved in this round
- [x] **Hero progress strip** — when there are pending items, a warning-tinted banner shows `N documents need your signature` with an overall progress bar and `signed/total` count.
- [x] **All-caught-up banner** when nothing is pending (success-tinted).
- [x] **Completion panel** for admins (sortable list, per-doc color-coded progress bar, percent).
- [x] **Hero-less toolbar** with search, scope chips (All / Action required with live count / Signed), and a sort dropdown (Most recent / Title A→Z / Pending first).
- [x] **One-line summary** — `N documents · N pending · N signed`.
- [x] **Status-coded card** — pending items get a warning-tinted card border, signed items get a subtle success-tinted card.
- [x] **Signed-by line** — `Signed Nh ago as "Full Name"` with a shield-check icon.
- [x] **Right-side sign sheet** — pre-fills the viewer's name in the signature field, validates in real-time (button disabled until name matches), explains the legal note, and shows a "You've signed this" success state with the recorded signature name and timestamp.
- [x] **Collapsible admin "Publish a new acknowledgement"** section.
- [x] **URL state persistence** — `?q=...&s=...&d=...` reflects search, scope, and the currently-open sheet.
- [x] **Body-scroll lock + ESC** on the sign sheet.
- [x] **Context-aware empty states**.

### New (this round)
- [x] `AcknowledgementRow` now includes `authorName` and `authorAvatar`.
- [x] `listForUser` joins the author user.
- [x] Pre-filled signature field that auto-validates against the viewer's profile name.

---

## Module-grade checks

| Category | Status |
| --- | --- |
| Auth-gated route | ✓ |
| Multi-tenant isolation | ✓ |
| `announcements.manage` gated for publish | ✓ |
| Name-match validation (case-insensitive, whitespace-normalized) | ✓ |
| IP captured with signature for audit | ✓ |
| One signature per user per doc (unique constraint) | ✓ |
| Audit trail | ✓ |
| RSC boundary compliance | ✓ |
| URL state persistence | ✓ |
| Color tokens only | ✓ |
| Empty / no-match states | ✓ |
| Inline feedback (busy / error / success) | ✓ |
| Mobile-friendly toolbar | ✓ |
| Light/dark theming | ✓ |
| Body-scroll lock + ESC | ✓ |
| Legal-notice disclosure in the sign sheet | ✓ |

---

## Backlog (out of scope this round)

- [ ] **Decline / dispute** flow (currently: sign or ignore).
- [ ] **PDF export** of the signed policy (with the signature + IP embedded).
- [ ] **Re-prompt** for unsigned employees via email digest.
- [ ] **Targeted acknowledgements** — currently every active user must sign; the schema doesn't have a "for users X, Y, Z" column.
- [ ] **Revoke / re-publish** — currently the only way to "un-publish" is to delete the row.
- [ ] **Re-sign with a different name** if a user updates their profile name.

---

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors.
- `npm run build` — clean. `/acknowledgements` 7.4 kB / 113 kB.
- `node scripts/smoke-company.mjs` — **46/46** (covers Acknowledgements end-to-end, including the sign flow and "Signed" state).
- `node scripts/e2e-all.mjs` — **64/64 passed**.
