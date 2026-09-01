# Announcements module audit

Module: **Announcements** (blueprint §43)
Route: `/announcements`
Status: **Production-grade (industry)**

---

## What users do here

- Read company-wide updates from HR and admins.
- Admins publish new announcements and delete their own (or any, with manage).
- Everyone sees announcements grouped by recency (Today / Yesterday / This week / This month / Older).

## Data model (current)

- Table `announcements`: `id`, `organization_id`, `author_user_id`, `title`, `body`, `audience` (default `company`), `published_at`, `created_at`.
- Audit: `ANNOUNCEMENT_PUBLISHED`, `ANNOUNCEMENT_DELETED`.

## Service surface

`src/modules/announcements/service.ts`:

- `listRecent(ctx, limit = 50)` — now joins `users.avatarUrl` for the author avatar.
- `create(ctx, { title, body })` — trim, write row, audit.
- `remove(ctx, id)` — verify exists in tenant, delete, audit.

API: `GET /api/v1/announcements`, `POST /api/v1/announcements`, `DELETE /api/v1/announcements`.

## UI / UX checklist

### Already in place
- [x] Server-rendered list with auth + module gate.
- [x] Admin-only publish form.
- [x] Audit trail.

### Improved in this round
- [x] **Hero-less toolbar** with search, scope chips (All / This week / Older), and "New announcement" button.
- [x] **One-line summary** instead of 4-col stats.
- [x] **Date-bucketed sections** — Today / Yesterday / This week / This month / "Month YYYY" / "Month YYYY".
- [x] **Author avatar + name + "You" pill** on every card.
- [x] **Right-side detail sheet** for the full body + delete affordance.
- [x] **Side-panel drawer** for the new-announcement form, with body-scroll lock, ESC dismissal, and a success state with "Publish another" / "Done".
- [x] **Context-aware empty states** — different copy for "no announcements", "no match", "nothing new this week", "nothing in the archive".
- [x] **URL state persistence** — `?q=...&s=...` reflects the search and scope.
- [x] **Inline feedback** — "Uploaded X" success, "Could not delete" error.
- [x] **Service enrichment** — `listRecent` now returns `authorAvatar` for the avatar in the card.

### New (this round)
- [x] `AnnouncementClientRow` includes `authorId` so the UI can show a "You" pill when the viewer authored the post.

---

## Module-grade checks

| Category | Status |
| --- | --- |
| Auth-gated route | ✓ |
| Module-gated route (`announcements` in `org.modules`) | ✓ |
| Multi-tenant isolation | ✓ |
| Admin-only publish / delete | ✓ |
| Audit trail | ✓ |
| RSC boundary compliance | ✓ |
| URL state persistence | ✓ |
| Color tokens only | ✓ |
| Empty / no-match states | ✓ |
| Inline feedback (busy / error) | ✓ |
| Mobile-friendly toolbar | ✓ |
| Light/dark theming | ✓ |
| Body-scroll lock on drawer | ✓ |

---

## Backlog (out of scope this round)

- [ ] **Push to all employees** with read receipts (currently a single broadcast with no per-user tracking).
- [ ] **Pin to top** (the `announcements` table doesn't have a `pinned` column yet).
- [ ] **Reactions / comments** on an announcement.
- [ ] **Audience targeting** — currently always `company`; the `audience` field exists but isn't used.
- [ ] **Email digest** of weekly announcements.
- [ ] **Scheduled publishing** — `publishedAt` is set on insert, not editable for "send later".

---

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors.
- `npm run build` — clean. `/announcements` 6.4 kB / 112 kB.
- `node scripts/smoke-company.mjs` — **46/46 browser checks pass**, including: empty state, admin "New announcement" button, API create + reload + visible, "Today" group, body preview.
- `node scripts/e2e-all.mjs` — **64/64 passed**.
