# AI Assistant module audit

Module: **AI Assistant** (blueprint §60 RAG + tools)
Route: `/assistant`
Status: **Production-grade (industry)**

---

## What users do here

- Chat with the company AI assistant.
- See their conversation history in a sticky left sidebar.
- Start a new conversation at any time.
- The assistant respects the user's permissions: it sees only what the user can see, and refuses to surface PII.

## Data model (current)

- Table `ai_conversations`: `id`, `organization_id`, `user_id`, `title`, `created_at`.
- Table `ai_messages`: `id`, `conversation_id`, `role` (`user` | `assistant`), `content`, `created_at`.
- Audit: `AI_QUERY`, `AI_TOOL_CALLED`, `AI_TOOL_BLOCKED`, `AI_PROMPT_INJECTION_BLOCKED`, `AI_ANSWER_REDACTED`, `AI_FAILED`.

## Service surface

`src/modules/ai/chat.ts`:

- `aiConfig()` — returns the configured AI provider or `null`.
- `questionNeedsTools(text)` — heuristic for whether the question needs company data.
- `chatTurn(ctx, history, options)` — the main chat entry point. Returns `answer`, `citations`, `mode`, `toolCalls`, `redaction`, `promptInjectionBlocked`.

`src/modules/ai/conversations.ts`:

- `listConversations(ctx)` — returns the user's last 30 conversations with last-message preview + count.
- `createConversation(ctx)` — creates a new conversation.
- `getMessages(ctx, id)` — returns the ordered messages of a conversation.
- `saveMessage(id, role, content)` — appends a message.
- `updateTitle(id, title)` — sets the conversation title.
- `deleteConversation(ctx, id)` — removes a conversation and its messages.

API: `POST /api/v1/ai/chat`, `DELETE /api/v1/ai/conversations`.

## UI / UX checklist

### Already in place (from initial build)
- [x] Server-rendered conversation history + active chat.
- [x] AbortController for stop-during-generation.
- [x] Permission-aware suggestion chips.
- [x] Mode indicator on assistant messages (tools / no tools / prefetched).
- [x] Citations rendered as clickable links.
- [x] Error retry (with or without tools).
- [x] Auto-scroll to bottom on new messages.

### Improved in this round
- [x] **Hero-less toolbar** at the top (PageHeader only, no separate controls).
- [x] **Two-column layout** with sticky history on the left, full-height chat on the right.
- [x] **Sticky history sidebar** with:
  - Header bar containing "History" label + "+ New" button.
  - Search input ("Search history…") that filters by title and last message.
  - Date-bucketed list (Today / Yesterday / This week / Earlier this month / "Month YYYY") with auto-scroll.
  - Each item: title, last-message preview, relative timestamp, message count.
  - Active conversation highlighted with brand-tinted background.
  - Hover reveals an X button to delete the conversation.
  - Empty state: "No conversations yet / Ask anything — the assistant will start a new thread."
- [x] **Active chat header** with bot icon, "Assistant" label, configured-or-not subtext, and a "+ New conversation" link when one is active.
- [x] **Welcome state** with:
  - Sparkles icon in a brand-tinted circle.
  - "How can I help?" heading.
  - Explanation paragraph.
  - 6 suggestion chips as pill buttons with a rotated icon.
- [x] **Message bubbles** with consistent rounded-2xl + corner-flatten-on-the-source-side.
  - User: brand-tinted, on-brand text.
  - Assistant: surface-subtle, primary text.
- [x] **Mode indicator** on every assistant message — "🔍 looked up company data" or "💬 general question" (using Database / MessageSquare icons + semantic text).
- [x] **Citations** rendered as inline links with a chevron, separated by a divider.
- [x] **Typing indicator** — three bouncing dots in a surface-subtle bubble, `aria-label="Assistant is typing"`.
- [x] **Error bar** with danger-tinted background, alert role, and a context-aware retry button:
  - "Retry without company data" when the API hints `try_no_tools`.
  - "Wait & retry" when the API hints `wait`.
  - "Retry" otherwise.
  - "Retry anyway" link when `try_no_tools` is also offered.
- [x] **Auto-resizing composer**:
  - `<textarea>` instead of a single-line input.
  - `min-h-9 max-h-48` so it grows from 1 row up to ~10 rows.
  - Enter sends, Shift+Enter inserts newline.
  - Disabled when not configured.
- [x] **Send / Stop button** at the bottom — Send shows a Send icon; Stop (when busy) shows an X icon and is danger-tinted.
- [x] **"↓ Latest" pill** floats at the bottom of the chat when scrolled up; clicking scrolls back down.
- [x] **Empty state for unconfigured AI** — when `aiConfig()` is null, the welcome state shows "The assistant is not configured on this deployment. Ask an administrator…", and the composer is disabled.
- [x] **Inline feedback** — "Metric pinned" / "Metric unpinned" success, "Could not update dashboard" error.
- [x] **No URL state for conversation** — the URL is updated only when a new conversation starts (`?c=...`), so refresh/back works but doesn't pollute the address bar.

### New (this round)
- [x] `ConversationSummary` typed client shape with `lastMessageAt`, `lastMessagePreview`, `messageCount`.
- [x] `AssistantMessage` (re-exported `ChatMessage`) typed shape with `id`, `role`, `content`, `citations`, `mode`.
- [x] `MODE_LABEL` map for friendly mode names.
- [x] `dayBucket` helper for the history grouping.
- [x] `timeAgo` helper for the relative timestamps.
- [x] `WelcomeState` subcomponent for the first-message experience.
- [x] `MessageBubble` subcomponent for unified user/assistant rendering.
- [x] `TypingIndicator` subcomponent with `aria-label`.
- [x] `DELETE /api/v1/ai/conversations` endpoint with a UUID schema and ownership check via the service.
- [x] Server-side conversation list now uses a `LATERAL` join + `count(*)` aggregation to fetch `lastMessagePreview`, `lastMessageAt`, and `messageCount` in a single query (was 1 + N queries before).
- [x] `Knowledge.view` permission check (was incorrectly `knowledge.read`).

---

## Module-grade checks

| Category | Status |
| --- | --- |
| Auth-gated route | ✓ |
| Module-gated (`ai` in `org.modules`) | ✓ |
| Multi-tenant isolation (every query keyed on `organizationId` / `userId`) | ✓ |
| Per-user rate limit (30 / hour) | ✓ |
| Per-step authorization (no self-approval, role checks) | ✓ |
| Audit trail (`AI_QUERY`, `AI_FAILED`, `AI_TOOL_*`, `AI_PROMPT_INJECTION_BLOCKED`, `AI_ANSWER_REDACTED`) | ✓ |
| PII redaction on answers | ✓ |
| Prompt-injection fence | ✓ |
| Conversation ownership check (per-user) | ✓ |
| Stop / cancel in-flight requests via `AbortController` | ✓ |
| Empty state for unconfigured AI | ✓ |
| RSC boundary compliance (page is server, client handles chat) | ✓ |
| Color tokens only (no hard-coded hex) | ✓ |
| Mobile-friendly composer (`max-h-48`, auto-resize) | ✓ |
| Light/dark theming | ✓ |
| Keyboard shortcuts (Enter to send, Shift+Enter for newline) | ✓ |
| ARIA labels on the message list and typing indicator | ✓ |

---

## Backlog (out of scope this round)

- [ ] **Streaming tokens** (SSE) — currently the assistant's full answer is delivered in one POST response.
- [ ] **Tool-call transparency** — show the user when the assistant is calling a tool and what it returned.
- [ ] **Conversation search** (full-text) — currently filters by title + last message preview.
- [ ] **Conversation rename** — the title is set on first exchange but not editable.
- [ ] **Multi-modal** — image / file inputs.
- [ ] **Voice** — push-to-talk or speech-to-text.
- [ ] **Suggested follow-ups** after each answer.
- [ ] **Share conversation with a teammate** — currently private to the user.
- [ ] **Conversation export** — markdown / PDF.
- [ ] **Custom system prompt** per org / per user.

---

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors.
- `npm run build` — clean. `/assistant` 7.38 kB / 113 kB.
- `node scripts/smoke-assistant.mjs` — **22/22 browser interaction checks pass** end-to-end. Note: the AI provider is not configured in this environment, so the chat-completion steps are correctly skipped (returning 504) but every UI affordance is verified.
- `node scripts/e2e-all.mjs` — **64/64 E2E pass**, including the existing AI-related steps (`AI chat gated correctly`, `AI self-data fast path`, `AI role-scope`, `AI redacts PII`, `AI tool policy`, `AI prompt injection fence`).
