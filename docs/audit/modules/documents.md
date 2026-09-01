# Documents module audit

Module: **Documents** (blueprint §29 file vault)
Route: `/documents`
Status: **Production-grade (industry)**

---

## What users do here

- Upload company / policy / personal files via drag-and-drop or file picker.
- See every visible document, grouped by category, with size / uploader / age / download count.
- Filter to Company / Policy / Personal / My uploads.
- Search by filename or uploader.
- Open a detail sheet for a doc (metadata, last download, permission note).
- Download a file (server-side permission check on every request).
- Delete their own files (or any file, if they have `documents.manage`).

## Data model (current)

- Table `documents`: `id`, `organization_id`, `uploaded_by`, `category` (`company` | `policy` | `personal`), `owner_user_id` (nullable; personal-doc owner), `file_name`, `mime_type`, `size_bytes`, `storage_key`, `created_at`.
- Storage: bytes live behind `src/lib/storage.ts`, keyed `tenant/{orgId}/documents/{uuid}`.
- Audit: `DOCUMENT_UPLOADED`, `DOCUMENT_DOWNLOADED`, `DOCUMENT_DELETED`.

## Service surface

`src/modules/documents/service.ts`:

- `listVisible(ctx)` — company/policy docs for the org + personal docs owned by the viewer. Now joins `users.avatarUrl` and the audit log for `downloadCount` + `lastDownloadedAt`.
- `upload(ctx, file, opts)` — `documents.upload` gated, 10 MB server cap, blocked-extension list, owner-must-belong-to-tenant check for personal docs. Rolls back the storage write if the DB write fails (no orphan bytes).
- `getForDownload(ctx, id)` — `documents.view` gated, owner/manage check, audit on every download.
- `remove(ctx, id)` — uploader-or-`documents.manage` gated, removes from storage + DB + audit.
- Constants: `MAX_UPLOAD_BYTES = 10 MB`, `MAX_UPLOAD_BYTES_API = 25 MB`.

API: `GET /api/v1/documents`, `POST /api/v1/documents`, `DELETE /api/v1/documents/:id`, `GET /api/v1/documents/:id/download`.

## UI / UX checklist

### Already in place (from initial build)
- [x] Server-rendered list with auth + module + permission gate.
- [x] Drag-and-drop upload zone with preflight checks (size, blocked extensions, mime).
- [x] File picker fallback with category selector.
- [x] Recently-opened row persisted in `localStorage`.
- [x] Expandable row to show full metadata.
- [x] Permission note: "Downloads are permission-checked on every request."
- [x] Delete gated to uploader-or-`documents.manage`.

### Improved in this round
- [x] **Hero-less toolbar** with search, scope chips (All / Company / Policy / Personal / My uploads), sort dropdown, view toggle, upload button.
- [x] **One-line summary** instead of a 4-col stat strip: `N documents · X total · C company · P policy · Pe personal`.
- [x] **Scope chips with live counts** (the `My uploads` chip shows the count).
- [x] **Inline compact drop zone** — single row, not a separate card. Hides after first upload? No, stays visible as a thin band so the user can keep adding files.
- [x] **Category selector lives in the drop zone** — picking "Personal" before browsing routes the next file there.
- [x] **Recently opened** as a horizontal scroll row (not a full card) — saved per browser, capped at 6 items, with relative-time tooltips.
- [x] **Grid view (default)**: card with file-type icon, filename (2-line clamp), category badge, "You" pill if uploader, size + type + age, uploader avatar.
- [x] **List view**: dense table-like row with file-type icon, name, category badge, size, download count, age, "You" pill, Get button, delete icon button.
- [x] **Lucide file-type icons** (replaces emojis) — `FileImage`, `FileText` (for PDF/DOC), `FileSpreadsheet`, `FileVideo` (also audio), `Archive` (zip/7z/tar/gz), `FileType` (text/csv/json/xml), `File` (other). Each tone-coded.
- [x] **Detail sheet (right-side drawer)** — opens on card/row click. Shows type, size, uploaded timestamp, download count, last download, uploader with avatar, owner notice (if personal), permission note, and Download / Delete actions. ESC and click-outside dismiss.
- [x] **Search by filename or uploader**, with clear button.
- [x] **Sort** — Most recent / Name (A→Z) / Largest first / Most downloaded.
- [x] **Context-aware empty states** — different copy for "no docs at all", "no policy docs", "no personal docs", "no my uploads", "no match".
- [x] **Status feedback** — "Uploaded X" green confirmation, danger-red error pill.
- [x] **URL state persistence** — `?v=list&s=policy` reflects current view + scope.

### New (this round)
- [x] `listVisible` now returns `uploaderAvatar`, `lastDownloadedAt` so the detail sheet can show "last download" and a proper avatar in the uploader row.
- [x] Page's `DocumentClientRow` includes `isOwner` (separate from `mine` — viewer is the uploader) so the detail sheet can show the "Personal — only you can see this" notice.

---

## Module-grade checks

| Category | Status |
| --- | --- |
| Auth-gated route | ✓ |
| Module + permission gate (`documents.view`) | ✓ |
| Multi-tenant isolation (`organizationId` everywhere) | ✓ |
| Server-side preflight (size + ext + mime) | ✓ |
| Client-side preflight (mirrors server) | ✓ |
| Permission check on every download | ✓ |
| Owner-or-`documents.manage` delete gate | ✓ |
| Storage rollback on DB write failure | ✓ |
| Audit trail (upload / download / delete) | ✓ |
| Drag-and-drop upload | ✓ |
| File picker fallback | ✓ |
| RSC boundary compliance | ✓ |
| URL state persistence | ✓ |
| Color tokens only (no hard-coded hex / emoji) | ✓ |
| Empty / no-match states | ✓ |
| Inline feedback (busy / error / saved) | ✓ |
| Mobile-friendly toolbar | ✓ |
| Light/dark theming | ✓ |
| Recently-opened persistence (localStorage) | ✓ |

---

## Backlog (intentionally out of scope this round)

- [ ] **Folder hierarchy** — currently flat categories only.
- [ ] **Searchable OCR for image PDFs** — text-search is currently filename + uploader only.
- [ ] **Multi-file upload** with per-file progress.
- [ ] **Version history** — re-uploads create a new row, not a v2 of the existing one.
- [ ] **Sharing link** — generate a signed URL that anyone with the link can access for N days.
- [ ] **Retention policy** — auto-delete or auto-archive after N days.
- [ ] **Tagging** — free-form tags in addition to category.
- [ ] **Full-text search via Postgres `tsvector`** — needs a migration + index.
- [ ] **Inline preview** — render PDF/images without downloading.
- [ ] **CSV / ZIP export** of a category or search result.

---

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors, 74 pre-existing warnings (none new in this round).
- `npm run build` — clean. `/documents` 7.52 kB / 116 kB First Load.
- `node scripts/smoke-documents.mjs` — **33/33 browser interaction checks pass**, including: empty state, all scope chips, sort options, drag-zone affordances, file upload via picker, scope filtering, detail sheet open/close, search filter, list view, delete, no console errors.
- `node scripts/e2e-all.mjs` — **64/64 passed**, including the existing `security: oversized upload rejected` and `security: blocked mime type rejected` tests (server-side preflight still works).
