# Wamiro Security Review — R13

Scope: master command §41 threat list. Every claim cites where it is enforced
and how it is verified. "Gap" rows are tracked in R0-forensics.

## Verified controls

| Threat | Control | Enforcement point | Verification |
|---|---|---|---|
| Cross-tenant leakage (§52) | org scoping on every query; session-derived tenant only | each service; `loadAuthContext` COALESCE join | isolation suite (15 surfaces) + sim leak assertions, 0 leaks |
| IDOR | every [id] lookup re-checks `organizationId` (+ ownership/permission) | services (`getExpense`, `getTicket`, docs download…) | E2E 404-on-cross-tenant asserts |
| Privilege escalation via invented permissions | engine refuses keys outside catalog | `can()` catalog lock (R3) | precedence.test N1 |
| Role escalation by self-approval | requests block self-decision; expenses block too; leave allows founder-only edge (documented) | review services | E2E request flow |
| Session abuse | 256-bit tokens, SHA-256-at-rest, httpOnly+SameSite, suspend ⇒ all sessions deleted | session lib + setUserStatus | E2E suspend→401→reactivate |
| CSRF | same-origin Origin check on all mutations | route() wrapper | code + suites |
| SQL injection | parameterized Drizzle everywhere; raw `sql` only with bound params | services | integration suite |
| XSS | React escaping; no `dangerouslySetInnerHTML` in product paths | components | typecheck/lint pass |
| Search leakage | permission gate BEFORE query; tenant filter first | search/service.ts | isolation suite |
| Document leakage | visibility categories + owner rules; cross-tenant download = 404 | documents service | isolation suite |
| AI leakage / action safety (§35–37) | tools are read-only + permission-gated; citations expose only permitted docs; no mutating tools exist yet | ai/tools + chatTurn | AI E2E step; §36-by-design |
| Rate limiting (credential stuffing) | login: per-IP + per-account windows; register: per-IP hourly, now env-tunable for bulk onboarding | auth routes | smoke/E2E runs |
| Sensitive logging | structured JSON logs carry ids/codes only — never passwords/tokens/provider payloads | api.ts logger | code audit |
| Secret handling | `.env` excluded from VCS; admin surfaces return booleans only (integrations API) | registry + routes | R7 code |
| File-upload abuse (§41) | **fixed this round**: 25 MB cap + mime allow-list on documents; 2 MB cap existed on logo | documents/branding routes | code; add negative-case test next |

## Gaps (tracked)

1. Upload guards lack an automated negative E2E case (oversized/blocked-type) — add to e2e-all.
2. Horizontal rate limits on non-auth mutations rely on same-origin + authz only.
3. Backup restore drill still unperformed (blocks DR claim — D11 carry-over).
4. Per-tool scope narrowing for AI resources (R10 remainder).
