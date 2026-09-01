# Assets module audit

Module: **Assets** (blueprint §30 GLPI-lite hardware inventory)
Route: `/assets`
Status: **Production-grade (industry)**

---

## What users do here

- **Employees** see the equipment currently assigned to them ("My assets").
- **Admins / HR** manage the full inventory: add hardware, assign it to teammates, return it to stock.
- Everyone can search by name, serial, or notes.
- Everyone can filter by category (Laptop / Phone / Monitor / Other) and by status (All / In stock / My assets).
- Right-side detail sheet for full metadata + reassign flow (admin).

## Data model (current)

- Table `assets`: `id`, `organization_id`, `name`, `category` (`laptop` | `phone` | `monitor` | `other`), `serial_number`, `notes`, `assigned_to_user_id` (nullable), `created_at`.
- Indexes on `organization_id` and `assigned_to_user_id`.
- Audit: `ASSET_CREATED`, `ASSET_ASSIGNED`, `ASSET_RETURNED`.
- Notification: `asset.assigned` → fires when an asset is newly assigned to a user.

## Service surface

`src/modules/assets/service.ts`:

- `listMine(ctx)` — assets where `assignedToUserId = ctx.user.id`. Now joins `users.avatarUrl` for the holder avatar.
- `listAll(ctx)` — `assets.manage` gated, full org inventory. Now joins `users.avatarUrl`.
- `createAsset(ctx, { name, category, serialNumber, notes })` — `assets.manage` gated, trim + length-clamp, write + audit.
- `assignAsset(ctx, assetId, targetUserEmail)` — `assets.manage` gated, email → user lookup (same org), update assignment, audit (`ASSET_ASSIGNED` or `ASSET_RETURNED`), notification.

API: `GET /api/v1/assets`, `POST /api/v1/assets`, `POST /api/v1/assets/:id/assign`.

## UI / UX checklist

### Already in place (from initial build)
- [x] Server-rendered list with auth + module + permission gate.
- [x] Add-asset form (admin).
- [x] Assign / return to stock (admin).
- [x] Audit trail.

### Improved in this round
- [x] **Hero-less toolbar** with search, scope chips (All / In stock / My assets with live counts), category filter dropdown with counts, and "Add asset" button (admin).
- [x] **One-line summary** instead of 4-col stats: `N assets · N in stock · N assigned · N assigned to you` (last only when > 0).
- [x] **Status-grouped sections** — "In stock" (brand dot) and "Assigned" (success dot), each with count + subtitle.
- [x] **Card grid view** with category-specific Lucide icons at the top of each card, status badge ("Assigned" / "In stock"), serial number, holder avatar + name.
- [x] **In-card "Return to stock" / "Assign"** affordance for managers (inline, no separate form).
- [x] **Right-side detail sheet** with full metadata (Category / Serial / Added / Holder / Notes), per-asset "Return to stock" + email "Assign" / "Reassign" form, and a "this asset is assigned to you" notice for employees.
- [x] **Side-panel drawer** for the new-asset form: Name + Category + Serial + Notes (optional), body-scroll lock, ESC dismissal.
- [x] **Context-aware empty states** — different copy for "No assets yet" / "Nothing in stock right now" / "Nothing assigned to you yet" / "No matches".
- [x] **URL state persistence** — `?q=...&c=...&s=...&d=...` for search, category, scope, and currently-open sheet.
- [x] **Inline feedback** — "Added X" / "Asset assigned" / "Asset returned to stock" success messages, "Could not update assignment" errors.
- [x] **Service enrichment** — `listAll` and `listMine` now return `assignedToAvatar` and `createdAt`; `listAll` also returns `notes` and `assignedToUserId`.

### New (this round)
- [x] `AssetClientRow` typed shape with `category: AssetCategory`, `notes`, `createdAt`, `assignedToUserId`, `assignedToAvatar`.
- [x] Category-specific visual: Laptop (Laptop icon, brand tone), Phone (Smartphone, warning), Monitor (Monitor, success), Other (Archive, neutral).
- [x] `asCategory()` type-coercion helper in the page so the category field is always a known value when it hits the client.

---

## Module-grade checks

| Category | Status |
| --- | --- |
| Auth-gated route | ✓ |
| Module-gated + permission-gated (`assets.view_self` minimum) | ✓ |
| Multi-tenant isolation | ✓ |
| `assets.manage` gated for create / assign / return | ✓ |
| Audit trail | ✓ |
| Notification on assignment | ✓ |
| RSC boundary compliance | ✓ |
| URL state persistence (read on mount + write on change) | ✓ |
| Color tokens only | ✓ |
| Empty / no-match states | ✓ |
| Inline feedback (busy / error / success) | ✓ |
| Mobile-friendly toolbar | ✓ |
| Light/dark theming | ✓ |
| Body-scroll lock + ESC | ✓ |

---

## Backlog (out of scope this round)

- [ ] **Edit asset** — name / category / serial / notes are set at create time, no edit UI.
- [ ] **Delete asset** (soft-delete) — currently only deactivation is implicit (assign to null); true delete isn't in the schema.
- [ ] **Asset history** — audit log of every assign/return with timestamps and actor.
- [ ] **Bulk import** via CSV.
- [ ] **Warranty / purchase date / supplier** — `notes` is freeform today.
- [ ] **Asset categories beyond the 4 built-ins** — `category` is a free text column on the DB; the UI just clamps to the 4 known values.
- [ ] **Per-user asset request flow** — employees can't ask for new equipment today.
- [ ] **Maintenance reminders** — based on `created_at + serviceInterval`.
- [ ] **Searchable OCR for receipts / warranty docs** linked to the asset.

---

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors.
- `npm run build` — clean. `/assets` 8.07 kB / 114 kB.
- `node scripts/smoke-assets.mjs` — **36/36 browser interaction checks pass**, including: empty state, all scope chips, category filter via URL, "Add asset" drawer, detail sheet, assign via API, summary reflecting the new state, no console errors.
- `node scripts/e2e-all.mjs` — **64/64 E2E pass**.
