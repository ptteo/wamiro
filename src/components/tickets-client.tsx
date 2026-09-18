"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Badge, Card, CardHeader, EmptyState, btn, input } from "./ui";
import { TicketToolkit } from "./ticket-toolkit";

interface Ticket {
  id: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  requesterName: string;
  assigneeName: string;
  slaDueDate: string | null;
  slaState: string;
  createdAt: string;
}

interface Reply {
  id: string;
  body: string;
  isInternal: boolean;
  userName: string;
  createdAt: string;
}

interface Attachment {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: string;
}

interface KnowledgeRef {
  id: string;
  title: string;
}

interface TicketDetail {
  id: string;
  requesterId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  requesterName: string;
  assigneeName: string | null;
  slaDueDate: string | null;
  firstResponseDueAt: string | null;
  firstResponseAt: string | null;
  slaState: string;
  csatScore: number | null;
  csatComment: string | null;
  relatedKnowledge: KnowledgeRef[];
  createdAt: string;
  replies: Reply[];
}

const STATUS_TONE: Record<string, "neutral" | "amber" | "green" | "red" | "brand"> = {
  new: "amber",
  open: "brand",
  waiting: "amber",
  resolved: "green",
  closed: "neutral",
};

const PRIORITY_TONE: Record<string, "neutral" | "brand" | "amber" | "red"> = {
  low: "neutral",
  medium: "brand",
  high: "amber",
  urgent: "red",
};

const SLA_TONE: Record<string, "neutral" | "amber" | "red" | "green"> = {
  ok: "neutral",
  at_risk: "amber",
  breached: "red",
};

const STATUS_OPTIONS = ["new", "open", "waiting", "resolved", "closed"] as const;

function fmtDur(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function fmtSla(due: string | null): string {
  if (!due) return "no SLA";
  const ms = new Date(due).getTime() - Date.now();
  if (ms <= 0) return `overdue ${fmtDur(Math.abs(ms))}`;
  return fmtDur(ms);
}

export function TicketsClient({
  tickets,
  canManage,
  canCreate,
  assignableUsers,
  viewerId,
  totalTickets,
}: {
  tickets: Ticket[];
  canManage: boolean;
  canCreate: boolean;
  assignableUsers: { id: string; name: string }[];
  viewerId?: string;
  /** G-15: total matching rows server-side (may exceed the shown page). */
  totalTickets?: number;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [replyBusy, setReplyBusy] = useState(false);
  const [csatScore, setCsatScore] = useState(0);
  const [csatBusy, setCsatBusy] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [canned, setCanned] = useState<{ id: string; name: string; category: string | null; body: string }[]>([]);

  useEffect(() => {
    if (!canManage) return;
    void fetch("/api/v1/tickets/canned-responses")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCanned)
      .catch(() => {});
  }, [canManage]);

  /** Re-fetch the open ticket (used after macro application changes it). */
  async function refreshDetail() {
    if (!openId) return;
    try {
      const res = await fetch(`/api/v1/tickets/${openId}`);
      if (res.ok) setDetail((await res.json()) as TicketDetail);
      const attRes = await fetch(`/api/v1/tickets/${openId}/attachments`);
      if (attRes.ok) setAttachments(((await attRes.json()) as { attachments: Attachment[] }).attachments);
    } catch {
      /* keep current detail */
    }
  }

  async function createTicket(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: f.get("title"),
          description: f.get("description"),
          category: f.get("category"),
          priority: f.get("priority"),
        }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not create ticket");
        return;
      }
      setCreating(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function openTicket(t: Ticket) {
    if (openId === t.id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(t.id);
    setDetail(null);
    setDetailError(null);
    setDetailBusy(true);
    setAttachments([]);
    try {
      const res = await fetch(`/api/v1/tickets/${t.id}`);
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setDetailError(d.error?.message ?? `Could not load ticket #${t.id}`);
        return;
      }
      setDetail((await res.json()) as TicketDetail);
      const attRes = await fetch(`/api/v1/tickets/${t.id}/attachments`);
      if (attRes.ok) {
        const body = (await attRes.json()) as { attachments: Attachment[] };
        setAttachments(body.attachments);
      }
    } finally {
      setDetailBusy(false);
    }
  }

  async function patch(body: Record<string, unknown>) {
    if (!openId) return;
    setDetailBusy(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${openId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setDetailError(d.error?.message ?? "Update failed");
        return;
      }
      const fresh = await fetch(`/api/v1/tickets/${openId}`);
      if (fresh.ok) setDetail((await fresh.json()) as TicketDetail);
      router.refresh();
    } finally {
      setDetailBusy(false);
    }
  }

  async function postReply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!openId) return;
    setReplyBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/v1/tickets/${openId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: f.get("body"),
          isInternal: f.get("isInternal") === "on",
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setDetailError(d.error?.message ?? "Reply failed");
        return;
      }
      (e.target as HTMLFormElement).reset();
      const fresh = await fetch(`/api/v1/tickets/${openId}`);
      if (fresh.ok) setDetail((await fresh.json()) as TicketDetail);
      router.refresh();
    } finally {
      setReplyBusy(false);
    }
  }

  async function uploadFile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!openId) return;
    setUploadBusy(true);
    const f = new FormData(e.currentTarget);
    const file = f.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setUploadBusy(false);
      return;
    }
    try {
      const res = await fetch(`/api/v1/tickets/${openId}/attachments`, {
        method: "POST",
        body: f,
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setDetailError(d.error?.message ?? "Upload failed");
        return;
      }
      (e.target as HTMLFormElement).reset();
      const attRes = await fetch(`/api/v1/tickets/${openId}/attachments`);
      if (attRes.ok) setAttachments(((await attRes.json()) as { attachments: Attachment[] }).attachments);
    } finally {
      setUploadBusy(false);
    }
  }

  async function submitCsat(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!openId || csatScore < 1) return;
    setCsatBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/v1/tickets/${openId}/csat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: csatScore, comment: f.get("comment") }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setDetailError(d.error?.message ?? "Could not save rating");
        return;
      }
      const fresh = await fetch(`/api/v1/tickets/${openId}`);
      if (fresh.ok) setDetail((await fresh.json()) as TicketDetail);
    } finally {
      setCsatBusy(false);
    }
  }

  return (
    <>
      {!canCreate ? <span data-tour="tickets-new" className="sr-only" /> : null}
      {canCreate && (
        <div data-tour="tickets-new">
          <button type="button" className={btn.primary} onClick={() => setCreating((v) => !v)}>
            {creating ? "Cancel" : "New ticket"}
          </button>
        </div>
      )}

      {creating && (
        <Card>
          <CardHeader title="New ticket" />
          <form onSubmit={createTicket} className="space-y-3 px-5 py-4">
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <label className="block text-sm font-medium">
              Title
              <input name="title" required minLength={3} maxLength={300} className={`${input} mt-1`} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Category
                <select name="category" className={`${input} mt-1`} defaultValue="other">
                  <option value="incident">Incident</option>
                  <option value="service_request">Service request</option>
                  <option value="access">Access</option>
                  <option value="hardware">Hardware</option>
                  <option value="software">Software</option>
                  <option value="other">Other</option>
                  <option value="platform">Platform support (Wamiro team)</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Priority
                <select name="priority" className={`${input} mt-1`} defaultValue="medium">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
            </div>
            <label className="block text-sm font-medium">
              Description
              <textarea
                name="description"
                required
                minLength={5}
                maxLength={10_000}
                className={`${input} mt-1 min-h-24`}
              />
            </label>
            <button type="submit" disabled={busy} className={btn.primary}>
              Submit ticket
            </button>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader
          title={
            totalTickets !== undefined && totalTickets > tickets.length
              ? `Tickets (${tickets.length} shown of ${totalTickets})`
              : `Tickets (${tickets.length})`
          }
        />
        {tickets.length === 0 ? (
          <EmptyState
            title="No tickets yet"
            hint={canCreate ? "Open a ticket for IT or workplace issues." : "Support tickets will appear here."}
            action={
              canCreate ? (
                <button type="button" className={`${btn.primary} ${btn.small} mt-3`} onClick={() => setCreating(true)}>
                  New ticket
                </button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-border-default">
            {tickets.map((t) => {
              const isOpen = openId === t.id;
              return (
                <li key={t.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => void openTicket(t)}
                      className="min-w-0 flex-1 truncate text-left font-medium text-primary hover:underline"
                      aria-expanded={isOpen}
                    >
                      {t.title}
                    </button>
                    <span className="text-xs text-tertiary">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </span>
                    <Badge tone={PRIORITY_TONE[t.priority] ?? "neutral"}>{t.priority}</Badge>
                    <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status}</Badge>
                    {t.slaDueDate && (
                      <Badge tone={SLA_TONE[t.slaState] ?? "neutral"}>
                        SLA {fmtSla(t.slaDueDate)}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-tertiary">
                    {t.category}
                    {t.requesterName ? ` · ${t.requesterName}` : ""}
                    {t.assigneeName ? ` · → ${t.assigneeName}` : ""}
                  </p>
                  {isOpen && (
                    <TicketDetailPanel
                      detail={detail}
                      busy={detailBusy}
                      error={detailError}
                      canManage={canManage}
                      assignableUsers={assignableUsers}
                      viewerId={viewerId}
                      onPatch={patch}
                      onReply={postReply}
                      onCsat={submitCsat}
                      csatScore={csatScore}
                      attachments={attachments}
                      onUpload={uploadFile}
                      uploadBusy={uploadBusy}
                      onRemoveAttachment={(attId) =>
                        setAttachments((prev) => prev.filter((x) => x.id !== attId))
                      }
                      setCsatScore={setCsatScore}
                      csatBusy={csatBusy}
                      replyBusy={replyBusy}
                      canned={canned}
                      onToolkitChanged={refreshDetail}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function TicketDetailPanel({
  detail,
  busy,
  error,
  canManage,
  assignableUsers,
  viewerId,
  onPatch,
  onReply,
  onCsat,
  csatScore,
  setCsatScore,
  csatBusy,
  replyBusy,
  attachments,
  onUpload,
  uploadBusy,
  onRemoveAttachment,
  canned,
  onToolkitChanged,
}: {
  detail: TicketDetail | null;
  busy: boolean;
  error: string | null;
  canManage: boolean;
  assignableUsers: { id: string; name: string }[];
  viewerId?: string;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
  onReply: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onCsat: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  csatScore: number;
  setCsatScore: (n: number) => void;
  csatBusy: boolean;
  replyBusy: boolean;
  attachments: Attachment[];
  onUpload: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  uploadBusy: boolean;
  onRemoveAttachment: (attId: string) => void;
  canned: { id: string; name: string; category: string | null; body: string }[];
  onToolkitChanged: () => Promise<void>;
}) {
  const replyRef = useRef<HTMLTextAreaElement>(null);

  if (busy && !detail) return <p className="mt-3 px-4 py-3 text-sm text-tertiary">Loading ticket…</p>;
  if (error) return <p role="alert" className="mt-3 px-4 py-3 text-sm text-danger">{error}</p>;
  if (!detail) return null;

  const isRequester = viewerId !== undefined && detail.requesterId === viewerId;
  const canReply = canManage || isRequester;
  const canCsat = isRequester && ["resolved", "closed"].includes(detail.status) && detail.csatScore === null;

  return (
    <div className="mt-3 rounded-lg border border-border-default bg-surface-subtle px-4 py-3 text-sm">
      <p className="whitespace-pre-wrap text-primary">{detail.description}</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <div><dt className="text-tertiary">Requester</dt><dd className="text-primary">{detail.requesterName}</dd></div>
        <div><dt className="text-tertiary">Assignee</dt><dd className="text-primary">{detail.assigneeName ?? "Unassigned"}</dd></div>
        <div><dt className="text-tertiary">Created</dt><dd className="text-primary">{new Date(detail.createdAt).toLocaleString()}</dd></div>
        <div><dt className="text-tertiary">Resolution SLA</dt><dd className="text-primary">{detail.slaDueDate ? `${new Date(detail.slaDueDate).toLocaleString()} (${fmtSla(detail.slaDueDate)})` : "—"}</dd></div>
        <div><dt className="text-tertiary">First response</dt><dd className="text-primary">{detail.firstResponseAt ? new Date(detail.firstResponseAt).toLocaleString() : detail.firstResponseDueAt ? `due ${new Date(detail.firstResponseDueAt).toLocaleString()}` : "—"}</dd></div>
        <div><dt className="text-tertiary">CSAT</dt><dd className="text-primary">{detail.csatScore ? `${"★".repeat(detail.csatScore)}${"☆".repeat(5 - detail.csatScore)}` : "—"}</dd></div>
      </dl>

      {canManage && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium">
            Assignee
            <select
              className={`${input} mt-1 h-8 w-48`}
              value={detail.assigneeName ?? ""}
              onChange={(e) => {
                const u = assignableUsers.find((x) => x.name === e.target.value);
                void onPatch({ assigneeId: u?.id ?? null });
              }}
            >
              <option value="">Unassigned</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.name}>{u.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            Status
            <select
              className={`${input} mt-1 h-8 w-40`}
              value={detail.status}
              onChange={(e) => void onPatch({ status: e.target.value })}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {detail.replies.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">
            Conversation
          </p>
          <ol className="mt-2 space-y-2">
            {detail.replies.map((r) => (
              <li
                key={r.id}
                className={[
                  "rounded-md border px-3 py-2",
                  r.isInternal
                    ? "border-border-default bg-surface"
                    : r.userName === detail.requesterName
                      ? "border-brand/30 bg-brand-subtle"
                      : "border-border-default bg-surface",
                ].join(" ")}
              >
                <div className="flex items-center justify-between text-xs text-tertiary">
                  <span className="font-medium text-primary">
                    {r.userName}
                    {r.isInternal && <Badge tone="amber">internal</Badge>}
                  </span>
                  <span>{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-primary">{r.body}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {detail.relatedKnowledge.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">
            Related knowledge
          </p>
          <ul className="mt-2 space-y-1">
            {detail.relatedKnowledge.map((k) => (
              <li key={k.id}>
                <a href={`/knowledge/${k.id}`} className="text-sm font-medium text-brand hover:underline">
                  {k.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">
            Attachments
          </p>
          <ul className="mt-2 space-y-1">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <a
                  href={`/api/v1/tickets/${detail.id}/attachments/${a.id}`}
                  className="font-medium text-brand hover:underline"
                >
                  {a.fileName}
                </a>
                <span className="text-xs text-tertiary">
                  {fmtBytes(a.sizeBytes)}
                  {canManage && (
                    <button
                      type="button"
                      className="ml-3 text-danger hover:underline"
                      onClick={async () => {
                        await fetch(`/api/v1/tickets/${detail.id}/attachments/${a.id}`, { method: "DELETE" });
                        onRemoveAttachment(a.id);
                      }}
                    >
                      Remove
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={onUpload} className="mt-3 flex flex-wrap items-center gap-2">
        <input name="file" type="file" className="text-xs text-tertiary" />
        <button type="submit" disabled={uploadBusy} className={`${btn.secondary} ${btn.small}`}>
          {uploadBusy ? "Uploading…" : "Attach file"}
        </button>
      </form>

      {canReply && (
        <form onSubmit={onReply} className="mt-4 space-y-2">
          {canManage && canned.length > 0 && (
            <label className="block text-xs font-medium">
              Canned response
              <select
                className={`${input} mt-1 h-8 w-full`}
                defaultValue=""
                onChange={(e) => {
                  const c = canned.find((x) => x.id === e.target.value);
                  if (c && replyRef.current) replyRef.current.value = c.body;
                }}
              >
                <option value="">Insert a canned response…</option>
                {canned.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.category ? `${c.category} / ` : ""}
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <textarea
            ref={replyRef}
            name="body"
            required
            minLength={1}
            maxLength={10_000}
            placeholder={canManage ? "Reply or add an internal note…" : "Reply…"}
            className={`${input} min-h-20`}
          />
          {canManage && (
            <label className="flex items-center gap-2 text-xs text-tertiary">
              <input type="checkbox" name="isInternal" className="h-3.5 w-3.5" />
              Internal note (visible only to support agents)
            </label>
          )}
          <button type="submit" disabled={replyBusy} className={`${btn.secondary} ${btn.small}`}>
            {replyBusy ? "Posting…" : "Post reply"}
          </button>
        </form>
      )}

      {canManage && (
        <TicketToolkit ticketId={detail.id} onMacroApplied={onToolkitChanged} />
      )}

      {canCsat && (
        <form onSubmit={onCsat} className="mt-4 rounded-md border border-border-default bg-surface px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">
            How was your experience?
          </p>
          <div className="mt-2 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                className={`text-xl ${n <= csatScore ? "text-warning" : "text-tertiary"}`}
                onClick={() => setCsatScore(n)}
              >
                ★
              </button>
            ))}
          </div>
          <input name="comment" placeholder="Anything to add? (optional)" maxLength={1000} className={`${input} mt-2 h-8`} />
          <button type="submit" disabled={csatBusy || csatScore < 1} className={`${btn.secondary} ${btn.small} mt-2`}>
            {csatBusy ? "Saving…" : "Submit rating"}
          </button>
        </form>
      )}
    </div>
  );
}