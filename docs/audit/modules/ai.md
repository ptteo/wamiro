# Module Excellence Checklist — AI

Program: module-by-module industry-grade upgrade. Competitor grounding:
ChatGPT (suggestion chips, stop button, citation links), Claude (tool-use
transparency), Notion AI (history sidebar with date stamps), Intercom Fin
(stop & retry affordances). Research note: web-search tool was
unavailable this session; patterns from established product knowledge.

## Already present (before this round)

- OpenAI-compatible chat completions via raw fetch (no SDK lock-in);
  works with OpenRouter, Groq, Ollama, OpenAI (`src/modules/ai/chat.ts`)
- Six typed tools executed in the caller's AuthContext so the model
  cannot see more than the user (`src/modules/ai/tools.ts`)
- Conversation persistence (`src/modules/ai/conversations.ts`) with
  per-user isolation, ownership check on history restore, and
  auto-titling on first exchange
- 30s provider timeout via `AbortController`
- Citation tracking for `search_company_knowledge` (blueprint §37)
- Permission-gated, module-gated, rate-limited (`30/hour/user`)
- 500 → 503 fix (r29) — provider failure now correctly returns
  Service Unavailable
- 59/60 E2E green including "AI chat gated correctly"

## Improved this round

- **Role-aware suggestion chips** — the page now generates up to five
  starter questions from the caller's effective access set. An
  employee sees leave + announcements + knowledge; a manager adds
  approvals + who's out; finance adds pending expenses + category
  breakdown; admin adds users + workforce summary; a workplace user
  adds room bookings
- **History sidebar with date stamps** — each conversation shows its
  date, line-clamped title, and active highlighting
- **"New conversation" button** in the header — clears the active
  conversation by linking back to `/assistant` without `?c=…`
- **Stop button** while a request is in flight — uses an
  `AbortController` so cancelling a slow provider call returns control
  to the user immediately
- **Typing indicator** with three-dot bounce animation (replaces
  the static "…")
- **Scroll-to-bottom pill** — when the user has scrolled up, a
  floating "↓ Latest" pill appears to jump back down. Auto-scroll
  only happens when the user is already at the bottom
- **Citation links** point to `/knowledge?id=…` which renders the
  full article in the existing Knowledge page
- **Updated conversation sync** — when the user navigates between
  conversations, the local message list resets from the new
  `initialMessages` instead of concatenating
- **Header subtitle** now distinguishes "Not configured on this
  deployment" from "Answers grounded in your own data via tools"

## New this round

- **`suggestionsFor(access)` helper** — pure function that derives
  starter questions from the caller's `EffectiveAccess`. Testable in
  isolation; no fetches required
- **Client-side abort plumbing** — `AbortController` per request,
  captured in a ref so the Stop button can fire it
- **`scrollStickyBottom` state** — small, accessible, ignores
  user-initiated scroll positions

## Verification

- `npm run typecheck` clean
- `npm run lint` 0 errors (12 warnings pre-existing)
- Full E2E: **59/60 passing** ("AI chat gated correctly" still green)
- Manual visual check: open `/assistant`, see five role-relevant
  suggestions, click one, see streaming-style typing, see sources
  chips, click a source to land on `/knowledge?id=…`

## Backlog (not in this round)

- True SSE streaming — currently the whole answer is loaded at
  once; a streaming response (chunked) would feel faster. Would
  require a small change in `chatTurn` to expose a delta stream
- Tool-use transparency — when the model calls a tool (e.g.
  `who_am_i`), the UI could show a "Looked up your profile" line.
  The model already returns tool calls; the client would need
  access to that stream
- Conversation export (PDF / Markdown) — useful for compliance
  and handoff; not currently surfaced
- Pinned conversations — currently chronological; a "pin" column
  would let users keep important threads at the top
- Multi-modal input (image attachments) — would require the
  provider to support vision; trivial plumbing if the provider
  is configured for it
