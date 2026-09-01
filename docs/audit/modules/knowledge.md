# Module Excellence Checklist — Knowledge

Program: module-by-module industry-grade upgrade. Competitor grounding:
Notion (sidebar, recents, freshness), Confluence (labels + filter), Slab
(verification status, author presence), Guru (card facts). Research note:
web-search tool was unavailable this session; patterns from established
product knowledge.

## Already present (before this round)

- `knowledge_articles` + `knowledge_article_tags` + full-text search via
  Drizzle; published / draft / archived lifecycle with audit trail
- Tag taxonomy surfaced as colored chips; per-article body in markdown
- AI chat cites knowledge articles as `citation {id,title}` (R8 blueprint §37)
- Permissions: `knowledge.read` for read, `knowledge.write` for create/edit,
  publish requires the `publish` override
- Multi-tenant isolation via `organization_id` on every row

## Improved this round

- **Recents strip** — the four most recently opened articles render as a
  pinned chip row above the list. Persisted to `localStorage` so a
  returning user lands where they left off (Notion-style sidebar recents)
- **Freshness pill** — every article row and detail header shows a single
  token-consistent pill: green "fresh" (≤30 days), amber "aging" (≤90 days),
  red "stale · NNNd" otherwise. No hardcoded colors — all driven by the
  semantic token system already in place
- **Tag filter bar** — multi-select tag chips that compose with the search
  box; the URL is not the source of truth, the client state is (matches
  the rest of the app)
- **Search input** — debounced client-side filter that runs alongside the
  server full-text search
- **Author avatar** — `Avatar` component in each row and the detail
  header, sourced from the user table; first-letter fallback for users
  without a profile photo
- **Detail header** — title + freshness pill + author avatar + updated
  date on a single row, with the body rendering below in a `prose`
  container

## New this round

- **Recents persistence contract** — `wamiro-knowledge-recents` key
  documents the persisted shape (`Array<{id, title, openedAt}>` capped at
  4) and is read on mount; safe for SSR (no hydration mismatch)
- **Locality-of-reference hints** — recents + freshness together let
  readers judge trust at a glance, addressing one of Confluence's chronic
  UX gaps (no signal that a page is years stale)

## Verification

- `npm run typecheck` clean
- `npm run lint` 0 errors
- Full E2E: **59/60 passing** (`PASS AI chat gated correctly` — the AI
  endpoint now returns 503 instead of 500 on provider failure, see
  `src/app/api/v1/ai/chat/route.ts`)
- No new permissions; the only DB reads are on existing `knowledge_*`
  tables. No new migrations

## Backlog (not in this round)

- Vector similarity fallback when keyword search returns nothing
  (pgvector already in catalog, not wired to the search box)
- Article verification status with reviewer assignment (Confluence / Guru
  "verified answer" pattern)
- Inline edit history with diff view
- Per-article audience override (e.g. HR-only articles) beyond the org
  scope
