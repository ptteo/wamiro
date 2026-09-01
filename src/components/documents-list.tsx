"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Download,
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Grid3x3,
  Inbox,
  List,
  Plus,
  Search,
  Trash2,
  Upload as UploadIcon,
  X,
} from "lucide-react";

import { Avatar, Badge } from "./ui";
import { cx } from "@/lib/cx";

// ── Types ───────────────────────────────────────────────────────
export type DocCategory = "company" | "policy" | "personal";

export interface DocumentClientRow {
  id: string;
  category: DocCategory;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  uploaderName: string | null;
  uploaderAvatar: string | null;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp of last download (joined from audit log). */
  lastDownloadedAt: string | null;
  /** Distinct viewers who downloaded this doc (joined from audit log). */
  downloadCount: number;
  /** Whether the viewer is the uploader (controls "Delete"). */
  mine: boolean;
  /** Whether the viewer owns this as a personal doc. */
  isOwner: boolean;
}

type ViewMode = "grid" | "list";
type ScopeFilter = "all" | "company" | "policy" | "personal" | "mine";
type SortKey = "recent" | "name" | "size" | "downloads";

// ── Constants ───────────────────────────────────────────────────
const BLOCKED_EXT = [".exe", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".com", ".scr", ".dll"];

const SCOPE_LABEL: Record<ScopeFilter, string> = {
  all: "All",
  company: "Company",
  policy: "Policy",
  personal: "Personal",
  mine: "My uploads",
};

const CATEGORY_TONE: Record<DocCategory, "brand" | "amber" | "tertiary"> = {
  company: "brand",
  policy: "amber",
  personal: "tertiary",
};

const SORT_LABEL: Record<SortKey, string> = {
  recent: "Most recent",
  name: "Name (A→Z)",
  size: "Largest first",
  downloads: "Most downloaded",
};

const RECENTS_KEY = "wamiro-documents-recents";
const MAX_RECENTS = 6;

interface RecentEntry {
  id: string;
  fileName: string;
  category: DocCategory;
  openedAt: number;
}

// ── Helpers ─────────────────────────────────────────────────────
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const ms = Date.now() - t;
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

interface FileTypeVisual {
  Icon: typeof FileText;
  tone: "brand" | "amber" | "red" | "green" | "neutral";
  label: string;
}

function fileType(mime: string): FileTypeVisual {
  if (/^image\//.test(mime)) return { Icon: FileImage, tone: "brand", label: "Image" };
  if (mime === "application/pdf") return { Icon: FileText, tone: "red", label: "PDF" };
  if (/^application\/vnd\.openxmlformats-officedocument\.wordprocessingml/.test(mime) || /msword/.test(mime))
    return { Icon: FileText, tone: "brand", label: "Document" };
  if (/vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml/.test(mime))
    return { Icon: FileSpreadsheet, tone: "green", label: "Spreadsheet" };
  if (/^video\//.test(mime)) return { Icon: FileVideo, tone: "amber", label: "Video" };
  if (/^audio\//.test(mime)) return { Icon: FileVideo, tone: "amber", label: "Audio" };
  if (/zip|7z|x-tar|gzip/.test(mime)) return { Icon: Archive, tone: "amber", label: "Archive" };
  if (/^text\//.test(mime) || mime === "application/json" || /javascript|typescript|xml|csv/.test(mime))
    return { Icon: FileType, tone: "neutral", label: "Text" };
  return { Icon: FileIcon, tone: "neutral", label: "File" };
}

function readRecents(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r.id === "string" && typeof r.fileName === "string")
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

function writeRecents(entry: RecentEntry) {
  if (typeof window === "undefined") return;
  const next = [entry, ...readRecents().filter((r) => r.id !== entry.id)].slice(0, MAX_RECENTS);
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

function clientPreflight(file: File): string | null {
  if (file.size === 0) return "Empty file";
  if (file.size > 25 * 1024 * 1024) return `File is ${fmtSize(file.size)}; limit is 25 MB`;
  const lower = file.name.toLowerCase();
  if (BLOCKED_EXT.some((ext) => lower.endsWith(ext))) return "This file type is blocked";
  if (
    file.type &&
    !/^(image|text|video|audio)\//.test(file.type) &&
    !/^application\/(pdf|msword|vnd\.openxmlformats-officedocument|vnd\.ms-excel|json|zip|x-7z-compressed|x-tar|gzip)/.test(file.type)
  ) {
    return "Unsupported file type";
  }
  return null;
}

// ── Component ───────────────────────────────────────────────────
export function DocumentsListClient({
  documents,
  canUpload,
  canManage,
}: {
  documents: DocumentClientRow[];
  canUpload: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("grid");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Hydrate recents from localStorage on mount
  useEffect(() => {
    setRecents(readRecents());
  }, []);

  // Persist view in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (view === "list") {
      params.set("v", "list");
    } else {
      params.delete("v");
    }
    if (scope !== "all") params.set("s", scope);
    else params.delete("s");
    const qs = params.toString();
    router.replace(qs ? `/documents?${qs}` : "/documents", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, scope]);

  // Close detail sheet on ESC
  useEffect(() => {
    if (!selectedId) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectedId]);

  function recordOpen(d: DocumentClientRow) {
    const entry: RecentEntry = {
      id: d.id,
      fileName: d.fileName,
      category: d.category,
      openedAt: Date.now(),
    };
    writeRecents(entry);
    setRecents(readRecents());
  }

  async function postFile(file: File, category: DocCategory) {
    const preflight = clientPreflight(file);
    if (preflight) {
      setError(preflight);
      return;
    }
    setUploading(true);
    setError(null)
    setInfo(null)
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("category", category);
      const res = await fetch("/api/v1/documents", { method: "POST", body: fd });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Upload failed");
        return;
      }
      setInfo(`Uploaded ${file.name}`);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Delete failed");
        return;
      }
      setRecents((rs) => rs.filter((r) => r.id !== id));
      if (selectedId === id) setSelectedId(null);
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  // Drag and drop
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await postFile(file, scope === "personal" ? "personal" : "company");
  }

  // Filter + sort
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = documents.filter((d) => {
      if (scope === "company" && d.category !== "company") return false;
      if (scope === "policy" && d.category !== "policy") return false;
      if (scope === "personal" && d.category !== "personal") return false;
      if (scope === "mine" && !d.mine) return false;
      if (needle) {
        if (
          !d.fileName.toLowerCase().includes(needle) &&
          !(d.uploaderName ?? "").toLowerCase().includes(needle)
        ) {
          return false;
        }
      }
      return true;
    });
    const sorted = [...out];
    switch (sort) {
      case "name":
        sorted.sort((a, b) => a.fileName.localeCompare(b.fileName));
        break;
      case "size":
        sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
        break;
      case "downloads":
        sorted.sort((a, b) => b.downloadCount - a.downloadCount);
        break;
      default:
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return sorted;
  }, [documents, q, scope, sort]);

  // Group by category for the grid view
  const groups = useMemo(() => {
    const byCat = new Map<DocCategory, DocumentClientRow[]>();
    for (const d of filtered) {
      const arr = byCat.get(d.category) ?? [];
      arr.push(d);
      byCat.set(d.category, arr);
    }
    const order: DocCategory[] = ["company", "policy", "personal"];
    return order
      .map((c) => ({ key: c, docs: byCat.get(c) ?? [] }))
      .filter((g) => g.docs.length > 0);
  }, [filtered]);

  const summary = useMemo(() => {
    const totalBytes = documents.reduce((s, d) => s + d.sizeBytes, 0);
    return {
      total: documents.length,
      totalBytes,
      company: documents.filter((d) => d.category === "company").length,
      policy: documents.filter((d) => d.category === "policy").length,
      personal: documents.filter((d) => d.category === "personal").length,
      mine: documents.filter((d) => d.mine).length,
    };
  }, [documents]);

  const selected = selectedId ? documents.find((d) => d.id === selectedId) ?? null : null;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 grow sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search documents..."
            aria-label="Search documents"
            className="w-full rounded-md border border-border-default bg-surface py-1.5 pl-8 pr-8 text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          {q ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-tertiary hover:text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="inline-flex rounded-md border border-border-subtle bg-surface p-0.5 text-xs">
          {(["all", "company", "policy", "personal", "mine"] as ScopeFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              aria-pressed={scope === s}
              className={cx(
                "rounded px-2.5 py-1 font-medium transition",
                scope === s
                  ? "bg-brand text-on-brand"
                  : "text-tertiary hover:text-primary",
              )}
            >
              {SCOPE_LABEL[s]}
              {s === "mine" && summary.mine > 0 ? (
                <span
                  className={cx(
                    "ml-1 inline-block min-w-4 rounded-full px-1 text-[10px] tabular-nums",
                    scope === s ? "bg-brand-hover" : "bg-surface-subtle text-tertiary",
                  )}
                >
                  {summary.mine}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <select
          aria-label="Sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-8 rounded-md border border-border-default bg-surface px-2 text-xs text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          {(Object.entries(SORT_LABEL) as Array<[SortKey, string]>).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <div className="ml-auto inline-flex rounded-md border border-border-subtle bg-surface p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
            aria-label="Grid view"
            className={cx(
              "inline-flex h-6 w-7 items-center justify-center rounded",
              view === "grid" ? "bg-brand text-on-brand" : "text-tertiary hover:text-primary",
            )}
          >
            <Grid3x3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            aria-label="List view"
            className={cx(
              "inline-flex h-6 w-7 items-center justify-center rounded",
              view === "list" ? "bg-brand text-on-brand" : "text-tertiary hover:text-primary",
            )}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>

        {canUpload ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            Upload
          </button>
        ) : null}
      </div>

      {/* One-line summary */}
      <p className="text-xs text-tertiary">
        {summary.total} document{summary.total === 1 ? "" : "s"} · {fmtSize(summary.totalBytes)} total ·{" "}
        {summary.company} company · {summary.policy} policy · {summary.personal} personal
        {q ? <> · {filtered.length} match{filtered.length === 1 ? "" : "es"} for &ldquo;{q}&rdquo;</> : null}
      </p>

      {/* Inline drop zone (compact after first upload) */}
      {canUpload ? (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cx(
            "flex flex-wrap items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 text-xs transition",
            dragOver
              ? "border-brand bg-brand-subtle"
              : "border-border-subtle bg-surface-subtle/40 hover:border-border-default",
          )}
        >
          <UploadIcon
            className={cx(
              "h-4 w-4 shrink-0",
              dragOver ? "text-brand-text" : "text-tertiary",
            )}
            aria-hidden
          />
          <p className="grow text-tertiary">
            <span className="font-medium text-primary">
              {dragOver ? "Drop to upload" : "Drag a file here"}
            </span>
            <span className="mx-1.5 text-disabled">·</span>
            PDF, Office, images, video, text, zip · max 25 MB
          </p>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border-default bg-surface px-2.5 py-1 text-xs font-medium text-secondary transition hover:bg-surface-hover">
            <UploadIcon className="h-3 w-3" />
            Browse
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) postFile(f, scope === "personal" ? "personal" : "company");
                e.currentTarget.value = "";
              }}
            />
          </label>
          <select
            aria-label="Category"
            defaultValue="company"
            onChange={(e) => {
              // The category is selected at upload time via the next file picker.
              // Stash in a data-attr on the file input.
              if (fileInputRef.current) {
                fileInputRef.current.dataset.category = e.target.value;
              }
            }}
            className="h-7 rounded-md border border-border-default bg-surface px-2 text-xs text-primary"
          >
            <option value="company">Company</option>
            <option value="policy">Policy</option>
            <option value="personal">Personal</option>
          </select>
        </div>
      ) : null}

      {/* Recents */}
      {recents.length > 0 ? (
        <div className="flex items-center gap-2 overflow-x-auto rounded-lg border border-border-subtle bg-surface px-4 py-2">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
            Recent
          </span>
          <ul className="flex shrink-0 items-center gap-1.5">
            {recents.map((r) => {
              const doc = documents.find((x) => x.id === r.id);
              if (!doc) return null;
              return (
                <li key={r.id}>
                  <Link
                    href={`/api/v1/documents/${r.id}/download`}
                    onClick={() => recordOpen(doc)}
                    className="inline-flex max-w-[18ch] items-center gap-1.5 rounded-md border border-border-default bg-surface-subtle/40 px-2 py-1 text-[11px] text-secondary transition hover:bg-surface-hover hover:text-primary"
                    title={`${r.fileName} · opened ${timeAgo(new Date(r.openedAt).toISOString())}`}
                  >
                    <span className="truncate font-medium">{r.fileName}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* Feedback */}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      {info && !error ? (
        <p role="status" className="inline-flex items-center gap-1 text-xs text-success">
          <CheckCircle2 className="h-3 w-3" />
          {info}
        </p>
      ) : null}

      {/* Results */}
      {filtered.length === 0 ? (
        <DocumentsEmpty
          scope={scope}
          q={q}
          hasDocs={documents.length > 0}
          canUpload={canUpload}
          onUpload={() => fileInputRef.current?.click()}
        />
      ) : view === "grid" ? (
        <div className="space-y-8">
          {groups.map((g) => (
            <DocSection key={g.key} category={g.key} count={g.docs.length}>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.docs.map((d) => (
                  <li key={d.id}>
                    <DocCard
                      doc={d}
                      onOpen={() => {
                        recordOpen(d);
                        setSelectedId(d.id);
                      }}
                      onDelete={onDelete}
                      deleting={deletingId === d.id}
                    />
                  </li>
                ))}
              </ul>
            </DocSection>
          ))}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
          {filtered.map((d) => (
            <li key={d.id} className="border-b border-border-subtle last:border-b-0">
              <DocRow
                doc={d}
                onOpen={() => {
                  recordOpen(d);
                  setSelectedId(d.id);
                }}
                onDelete={onDelete}
                deleting={deletingId === d.id}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Detail sheet */}
      {selected ? (
        <DocDetailSheet
          doc={selected}
          canDelete={canManage || selected.mine}
          deleting={deletingId === selected.id}
          onClose={() => setSelectedId(null)}
          onDelete={onDelete}
          onOpen={() => recordOpen(selected)}
        />
      ) : null}
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────
function DocSection({
  category,
  count,
  children,
}: {
  category: DocCategory;
  count: number;
  children: React.ReactNode;
}) {
  const dotTone = category === "company" ? "bg-brand" : category === "policy" ? "bg-warning" : "bg-tertiary";
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className={cx("inline-block h-1.5 w-1.5 rounded-full", dotTone)} aria-hidden />
        <h2 className="text-sm font-semibold text-primary">
          {category === "company" ? "Company" : category === "policy" ? "Policy" : "Personal"}
        </h2>
        <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-tertiary">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function DocCard({
  doc: d,
  onOpen,
  onDelete,
  deleting,
}: {
  doc: DocumentClientRow;
  onOpen: () => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const { Icon, tone, label } = fileType(d.mimeType);
  const toneCls =
    tone === "brand"
      ? "bg-brand-subtle text-brand-text"
      : tone === "red"
        ? "bg-danger-subtle text-danger"
        : tone === "amber"
          ? "bg-warning-subtle text-warning"
          : tone === "green"
            ? "bg-success-subtle text-success"
            : "bg-surface-subtle text-secondary";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full flex-col items-stretch overflow-hidden rounded-lg border border-border-subtle bg-surface text-left transition hover:border-border-default hover:shadow-[0_4px_10px_rgba(16,24,40,0.06)]"
    >
      <div className={cx("flex h-20 items-center justify-center", toneCls)} aria-hidden>
        <Icon className="h-9 w-9" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-3 py-2.5">
        <p className="line-clamp-2 text-xs font-semibold text-primary" title={d.fileName}>
          {d.fileName}
        </p>
        <div className="flex items-center gap-1.5">
          <Badge tone={CATEGORY_TONE[d.category]}>
            {d.category === "company" ? "Company" : d.category === "policy" ? "Policy" : "Personal"}
          </Badge>
          {d.mine ? (
            <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-tertiary">
              You
            </span>
          ) : null}
        </div>
        <p className="mt-auto text-[10px] text-tertiary">
          {fmtSize(d.sizeBytes)} · {label} · {timeAgo(d.createdAt)}
        </p>
        {d.uploaderName ? (
          <div className="flex items-center gap-1 text-[10px] text-tertiary">
            <Avatar name={d.uploaderName} src={d.uploaderAvatar ?? undefined} className="!h-4 !w-4 text-[8px]" />
            <span className="truncate">{d.uploaderName}</span>
          </div>
        ) : null}
      </div>
    </button>
  );
}

function DocRow({
  doc: d,
  onOpen,
  onDelete,
  deleting,
}: {
  doc: DocumentClientRow;
  onOpen: () => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const { Icon, tone, label } = fileType(d.mimeType);
  return (
    <div
      className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm transition hover:bg-surface-hover"
    >
      <button
        type="button"
        onClick={onOpen}
        className={cx(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          tone === "brand"
            ? "bg-brand-subtle text-brand-text"
            : tone === "red"
              ? "bg-danger-subtle text-danger"
              : tone === "amber"
                ? "bg-warning-subtle text-warning"
                : tone === "green"
                  ? "bg-success-subtle text-success"
                  : "bg-surface-subtle text-secondary",
        )}
        aria-label={`Open ${d.fileName}`}
      >
        <Icon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 truncate text-left font-medium text-primary hover:underline"
      >
        {d.fileName}
      </button>
      <Badge tone={CATEGORY_TONE[d.category]}>
        {d.category === "company" ? "Company" : d.category === "policy" ? "Policy" : "Personal"}
      </Badge>
      <span className="hidden w-20 text-right text-[11px] text-tertiary tabular-nums sm:inline">
        {fmtSize(d.sizeBytes)}
      </span>
      <span className="hidden w-20 text-right text-[11px] text-tertiary tabular-nums sm:inline">
        {d.downloadCount} dl
      </span>
      <span className="hidden w-24 text-[11px] text-tertiary sm:inline">{timeAgo(d.createdAt)}</span>
      {d.mine ? (
        <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-tertiary">
          You
        </span>
      ) : null}
      <Link
        href={`/api/v1/documents/${d.id}/download`}
        onClick={onOpen}
        className="inline-flex items-center gap-1 rounded-md border border-border-default bg-surface px-2 py-1 text-xs font-medium text-secondary transition hover:bg-surface-hover hover:text-primary"
      >
        <Download className="h-3 w-3" />
        Get
      </Link>
      <button
        type="button"
        onClick={() => onDelete(d.id)}
        disabled={deleting}
        className="rounded-md p-1.5 text-tertiary hover:bg-danger-subtle hover:text-danger disabled:opacity-50"
        aria-label={`Delete ${d.fileName}`}
        title="Delete"
      >
        {deleting ? (
          <span
            aria-hidden
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

function DocumentsEmpty({
  scope,
  q,
  hasDocs,
  canUpload,
  onUpload,
}: {
  scope: ScopeFilter;
  q: string;
  hasDocs: boolean;
  canUpload: boolean;
  onUpload: () => void;
}) {
  let title = "No documents yet";
  let hint = "Drop a file in the upload area above to get started.";
  if (q) {
    title = "No documents match your search";
    hint = "Try a different search term or clear the filter.";
  } else if (scope === "personal") {
    title = "No personal documents yet";
    hint = "Pick 'Personal' as the category when uploading — only you will see it.";
  } else if (scope === "policy") {
    title = "No policy documents";
    hint = "Policy docs are company-wide references — ask an admin to add one.";
  } else if (scope === "company") {
    title = "No company documents yet";
    hint = "Upload a PDF, image, or Office file to get the team started.";
  } else if (scope === "mine") {
    title = "You haven't uploaded anything yet";
    hint = "Files you upload are listed under 'My uploads' for quick access.";
  }
  return (
    <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-10 text-center">
      <Inbox className="mx-auto h-6 w-6 text-tertiary" />
      <p className="mt-2 text-sm font-medium text-primary">{title}</p>
      <p className="mt-1 text-xs text-tertiary">{hint}</p>
      {hasDocs && canUpload && !q ? (
        <button
          type="button"
          onClick={onUpload}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          Upload
        </button>
      ) : null}
    </div>
  );
}

function DocDetailSheet({
  doc: d,
  canDelete,
  deleting,
  onClose,
  onDelete,
  onOpen,
}: {
  doc: DocumentClientRow;
  canDelete: boolean;
  deleting: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  onOpen: () => void;
}) {
  const { Icon, tone, label } = fileType(d.mimeType);
  const toneCls =
    tone === "brand"
      ? "bg-brand-subtle text-brand-text"
      : tone === "red"
        ? "bg-danger-subtle text-danger"
        : tone === "amber"
          ? "bg-warning-subtle text-warning"
          : tone === "green"
            ? "bg-success-subtle text-success"
            : "bg-surface-subtle text-secondary";

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal,50)] flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={`${d.fileName} details`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-md flex-col bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border-default px-5 py-3">
          <div
            className={cx(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
              toneCls,
            )}
            aria-hidden
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">{label}</p>
            <h2 className="truncate text-base font-semibold text-primary" title={d.fileName}>
              {d.fileName}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone={CATEGORY_TONE[d.category]}>
                {d.category === "company" ? "Company" : d.category === "policy" ? "Policy" : "Personal"}
              </Badge>
              {d.mine ? (
                <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-tertiary">
                  You uploaded
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-tertiary hover:bg-surface-hover hover:text-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <Field label="Type">{d.mimeType || "unknown"}</Field>
            <Field label="Size">{fmtSize(d.sizeBytes)}</Field>
            <Field label="Uploaded">{new Date(d.createdAt).toLocaleString()}</Field>
            <Field label="Downloads">
              {d.downloadCount} {d.downloadCount === 1 ? "time" : "times"}
            </Field>
            {d.lastDownloadedAt ? (
              <Field label="Last download" className="col-span-2">
                {new Date(d.lastDownloadedAt).toLocaleString()}
              </Field>
            ) : null}
            <Field label="Uploader" className="col-span-2">
              {d.uploaderName ? (
                <span className="inline-flex items-center gap-1.5">
                  <Avatar
                    name={d.uploaderName}
                    src={d.uploaderAvatar ?? undefined}
                    className="!h-5 !w-5 text-[9px]"
                  />
                  {d.uploaderName}
                </span>
              ) : (
                <span className="text-tertiary">Unknown</span>
              )}
            </Field>
            {d.isOwner ? (
              <Field label="Owner" className="col-span-2">
                <span className="inline-flex items-center gap-1.5 text-secondary">
                  Personal document — only you can see this
                </span>
              </Field>
            ) : null}
          </dl>

          <div className="rounded-md border border-border-subtle bg-surface-subtle/40 p-3 text-[11px] text-tertiary">
            <p className="font-medium text-secondary">Permission check</p>
            <p className="mt-1">
              Downloads are authorized on every request. Personal documents are visible to the
              uploader (and to the owner, if different) plus anyone with{" "}
              <code className="rounded bg-surface px-1 py-0.5 font-mono text-[10px] text-primary">
                documents.manage
              </code>
              .
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-2 border-t border-border-default bg-surface px-5 py-3">
          {canDelete ? (
            <button
              type="button"
              onClick={() => onDelete(d.id)}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-md border border-danger/30 bg-surface px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger-subtle disabled:opacity-50"
            >
              {deleting ? (
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              Delete
            </button>
          ) : (
            <span className="text-[11px] text-tertiary">
              You can download but not delete this file.
            </span>
          )}
          <Link
            href={`/api/v1/documents/${d.id}/download`}
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
          >
            <Download className="h-3 w-3" />
            Download
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <dt className="font-semibold uppercase tracking-wide text-[10px] text-tertiary">{label}</dt>
      <dd className="mt-0.5 text-primary">{children}</dd>
    </div>
  );
}
