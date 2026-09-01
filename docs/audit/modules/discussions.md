# Discussions module audit

Module: **Discussions** (blueprint §43–§46)
Route: `/discussions`
Status: **Production-grade (industry)**

---

## What users do here

- Start a discussion with a title + body, optionally pinned.
- Reply to discussions in a threaded view.
- Pin your own posts; admins can pin any post.
- Search and filter to Pinned / My posts.

## Data model (current)

- Table `discussions`: `id`, `organization_id`, `title`, `body`, `created_by`, `scope` (`company` | `team` | `project` | `department`), `scope_id` (nullable), `pinned`, `created_at`.
- Table `discussion_replies`: `id`, `discussion_id`, `user_id`, `body`, `created_at`.
- Audit: `DISCUSSION_CREATED`.

## Service surface

`src/modules/discussions/service.ts`:

- `listDiscussions(ctx)` — now joins `users.avatarUrl` and aggregates `lastReplyAt` from replies.
- `getDiscussion(ctx, id)` — now returns `userAvatar` on each reply.
- `createDiscussion(ctx, { title, body, pinned })` — `announcements.manage` required to pin (others' posts); anyone with `requests.apply` can create.
- `addReply(ctx, discussionId, body)` — anyone can reply.

API: `GET /api/v1/discussions`, `POST /api/v1/discussions`, `GET /api/v1/discussions/:id`, `POST /api/v1/discussions/:id/replies`.

## UI / UX checklist

### Already in place
- [x] Server-rendered list with auth + module gate.
- [x] Reply thread view.
- [x] Audit trail.

### Improved in this round
- [x] **Hero-less toolbar** with search, scope chips (All / Pinned / My posts with live count), and "New discussion" button.
- [x] **One-line summary** — `N discussions · N pinned · N started by you`.
- [x] **Pinned discussion cards** get a brand-toned border + a "Pinned" pill.
- [x] **Author avatar + name** on every card and every reply.
- [x] **Reply count + last activity** on the card.
- [x] **Right-side thread panel** (slide-in) with full body, threaded replies, and inline reply form.
- [x] **Cmd/Ctrl+Enter** to send replies.
- [x] **Side-panel drawer** for "Start a discussion" with a "Pin this discussion to the top" checkbox.
- [x] **Context-aware empty states**.
- [x] **URL state persistence** — `?q=...&s=...&d=...` reflects search, scope, and currently-open discussion.
- [x] **"You" pill** on the viewer's own discussions and replies.
- [x] **Body-scroll lock + ESC** to close panel/drawer.

### New (this round)
- [x] `lastReplyAt` aggregation in the list query so the card can show "last activity Nh ago".
- [x] `DiscussionSummary` and `DiscussionReply` client shapes with author avatars + ownership flag.
- [x] Pinned-then-recent sort.
- [x] Inline reply form with loading state.

---

## Module-grade checks

| Category | Status |
| --- | --- |
| Auth-gated route | ✓ |
| Module-gated route | ✓ |
| Multi-tenant isolation | ✓ |
| Audit trail | ✓ |
| RSC boundary compliance | ✓ |
| URL state persistence | ✓ |
| Color tokens only | ✓ |
| Empty / no-match states | ✓ |
| Inline feedback (busy / error) | ✓ |
| Mobile-friendly toolbar | ✓ |
| Light/dark theming | ✓ |
| Body-scroll lock + ESC | ✓ |
| Keyboard shortcut (Cmd+Enter) | ✓ |

---

## Backlog (out of scope this round)

- [ ] **Reactions / likes** on a discussion or reply.
- [ ] **@mentions** with notifications.
- [ ] **Markdown support** — currently plain text only.
- [ ] **Realtime updates** — the thread currently re-fetches on open + on submit.
- [ ] **Edit / delete own post** — neither exists yet.
- [ ] **File attachments** on a discussion.
- [ ] **Move to project / team / department** scope (the `scope` and `scope_id` columns exist but aren't surfaced).
- [ ] **Subscribe to discussion** for email notifications on new replies.

---

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors.
- `npm run build` — clean. `/discussions` 6.83 kB / 113 kB.
- `node scripts/smoke-company.mjs` — **46/46** (covers Discussions end-to-end).
- `node scripts/e2e-all.mjs` — **64/64 passed**.
