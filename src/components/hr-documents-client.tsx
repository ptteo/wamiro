"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Trash2, UploadCloud } from "lucide-react";

import { Button } from "./ui";
import { cx } from "@/lib/cx";
import { HR_DOC_LABELS, hrDocLabel } from "@/lib/hr-doc";

export interface HrDocRow {
  id: string;
  employeeUserId: string;
  employeeName: string;
  docType: string;
  title: string;
  mimeType: string | null;
  sizeBytes: number;
  expiresAt: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface HrDocumentsData {
  canManageAll: boolean;
  viewerId: string;
  docs: HrDocRow[];
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function HrDocumentsClient({ data }: { data: HrDocumentsData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // upload form
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [docType, setDocType] = useState("offer_letter");
  const [title, setTitle] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (data.canManageAll && people.length === 0) {
      fetch("/api/v1/people")
        .then((r) => r.json())
        .then((d: { people?: { userId: string; name: string }[] }) => {
          setPeople((d.people ?? []).map((p) => ({ id: p.userId, name: p.name })));
        })
        .catch(() => {});
    }
  }, [data.canManageAll, people.length]);

  const { mine, all } = useMemo(() => {
    const mineRows = data.docs.filter((d) => d.employeeUserId === data.viewerId);
    return { mine: mineRows, all: data.docs };
  }, [data.docs, data.viewerId]);

  const rows = data.canManageAll ? all : mine;

  const doUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setError("Choose a file first");
    if (!data.canManageAll && !data.docs) return;
    const target = data.canManageAll ? employeeId : data.viewerId;
    if (!target) return setError("Choose an employee");
    const fd = new FormData();
    fd.set("employeeUserId", target);
    fd.set("docType", docType);
    fd.set("title", title.trim() || file.name);
    if (expiresAt) fd.set("expiresAt", expiresAt);
    fd.set("file", file);

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/v1/hr-documents", { method: "POST", body: fd });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok) {
        setError(d.error?.message ?? `Upload failed (${res.status})`);
        return;
      }
      setInfo("Document uploaded");
      setFile(null);
      setTitle("");
      setExpiresAt("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this document? The file is removed from storage.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/hr-documents/${id}`, { method: "DELETE" });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok) {
        setError(d.error?.message ?? "Delete failed");
        return;
      }
      setInfo("Document deleted");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const expiringSoon = (iso: string | null) => {
    if (!iso) return null;
    const ms = new Date(iso + "T00:00:00").getTime() - Date.now();
    if (ms < 0) return "expired";
    if (ms < 30 * 86_400_000) return "soon";
    return null;
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 rounded-lg border border-border-subtle bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
            <FileText className="h-4 w-4 text-tertiary" />
            {data.canManageAll ? "Everyone's documents" : "My documents"}
          </h2>
          <span className="text-xs text-tertiary">
            {rows.length} file{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-tertiary">
            No documents yet
            {!data.canManageAll ? " — HR files like your contract appear here." : " — upload the first one."}
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {rows.map((d) => {
              const expiry = expiringSoon(d.expiresAt);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <span
                    className={cx(
                      "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      "bg-brand-subtle text-brand",
                    )}
                    aria-hidden
                  >
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-primary">{d.title}</p>
                    <p className="truncate text-[11px] text-tertiary">
                      {hrDocLabel(d.docType)}
                      {data.canManageAll && d.employeeName ? ` · ${d.employeeName}` : ""}
                      {" · "}
                      {fmtBytes(d.sizeBytes)}
                      {d.expiresAt && (
                        <>
                          {" · expires "}
                          {d.expiresAt}
                        </>
                      )}
                    </p>
                  </div>
                  {expiry && (
                    <span
                      className={cx(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        expiry === "expired" ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning",
                      )}
                    >
                      {expiry === "expired" ? "Expired" : "Expiring soon"}
                    </span>
                  )}
                  <a
                    href={`/api/v1/hr-documents/${d.id}/download`}
                    className="inline-flex items-center gap-1 rounded-md border border-border-strong px-2 py-1 text-[11px] font-medium text-secondary transition hover:bg-surface-hover"
                  >
                    <Download className="h-3.5 w-3.5" /> Open
                  </a>
                  <button
                    type="button"
                    aria-label={`Delete ${d.title}`}
                    onClick={() => remove(d.id)}
                    className="rounded-md p-1 text-tertiary transition hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="space-y-4">
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">{error}</p>
        )}
        {info && (
          <p className="rounded-md border border-success/30 bg-success-subtle px-3 py-2 text-sm text-success">{info}</p>
        )}
        <form onSubmit={doUpload} className="grid gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
            <UploadCloud className="h-4 w-4 text-tertiary" /> Upload document
          </h2>
          {data.canManageAll && (
            <>
              <label className="flex flex-col text-[11px] font-medium text-secondary">
                Employee
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="mt-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-primary"
                >
                  <option value="">Choose an employee…</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-[11px] font-medium text-secondary">
                Type
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="mt-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-primary"
                >
                  {Object.entries(HR_DOC_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="flex flex-col text-[11px] font-medium text-secondary">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 2026 Employment contract"
              className="mt-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary"
            />
          </label>
          <label className="flex flex-col text-[11px] font-medium text-secondary">
            Expires (optional)
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="mt-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-primary"
            />
          </label>
          <label className="flex flex-col text-[11px] font-medium text-secondary">
            File
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 text-sm text-primary file:mr-3 file:rounded-md file:border-0 file:bg-brand-subtle file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-brand"
            />
          </label>
          <Button variant="primary" loading={busy} className="justify-center">
            <UploadCloud className="h-4 w-4" /> Upload
          </Button>
        </form>
      </aside>
    </div>
  );
}
