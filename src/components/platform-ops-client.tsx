"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, CardHeader, EmptyState, btn } from "./ui";

// ---------------------------------------------------------------------------
// Phase E console v2: risk board · impersonation · broadcast · support queue
// Lives in its own client island below the existing tenant registry so the
// operator answers "who is at risk this week?" in one screen.
// ---------------------------------------------------------------------------

export interface RiskTenant {
  organizationId: string;
  name: string;
  slug: string;
  plan: string;
  billingStatus: string;
  userCount: number;
  active7d: number;
  lastActiveAt: string | null;
  dormantHours: number | null;
  risk: "high" | "medium" | "low";
  setupDone: boolean;
  trialDaysLeft: number | null;
}

export interface SupportGrant {
  grantId: string;
  organizationId: string;
  orgName: string;
  reason: string;
  operatorLabel: string | null;
  expiresAt: string;
}

export interface QueueTicket {
  id: string;
  orgName: string;
  title: string;
  status: string;
  priority: string;
  slaState: string;
  escalatedAt: string | null;
  createdAt: string;
  requesterName: string;
}

export interface LedgerRow {
  id: string;
  orgName: string;
  operatorName: string;
  reason: string;
  startedAt: string;
  endedAt: string | null;
}

const RISK_TONE = { high: "red", medium: "amber", low: "green" } as const;

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export interface PendingOp {
  id: string;
  kind: string;
  orgName: string;
  reason: string;
  requestedBy: string;
  requesterName: string;
  createdAt: string;
}

export function PlatformOpsClient({
  riskTenants,
  grants,
  queue,
  ledger,
  pendingOps,
  selfUserId,
}: {
  riskTenants: RiskTenant[];
  grants: SupportGrant[];
  queue: QueueTicket[];
  ledger: LedgerRow[];
  pendingOps: PendingOp[];
  selfUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [targets, setTargets] = useState<{ id: string; name: string; email: string }[] | null>(null);
  const [openGrant, setOpenGrant] = useState<string | null>(null);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});

  async function decide(opId: string, action: "approve" | "reject") {
    await act(`op:${opId}`, () =>
      fetch("/api/v1/platform/destructive-ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId, action }),
      }),
      action === "approve" ? "Approved and executed." : "Rejected.",
    );
  }

  async function act(key: string, fn: () => Promise<Response>, okMsg?: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fn();
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Action failed");
        return false;
      }
      if (okMsg) setNotice(okMsg);
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function openImpersonation(grantId: string, orgId: string) {
    setBusy(grantId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/platform/impersonate?grantId=${grantId}`);
      const d = (await res.json()) as { targets?: { id: string; name: string; email: string }[] };
      if (!res.ok || !d.targets) {
        setError("Could not load impersonation targets");
        return;
      }
      setTargets(d.targets);
      setOpenGrant(grantId);
      void orgId;
    } finally {
      setBusy(null);
    }
  }

  async function impersonate(grantId: string, targetUserId: string) {
    const ok = await act(`imp:${targetUserId}`, () =>
      fetch("/api/v1/platform/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId, targetUserId }),
      }),
    );
    if (ok) window.location.href = "/home";
  }

  async function broadcast() {
    if (!confirm(`Broadcast to ALL active tenants?`)) return;
    const ok = await act(
      "broadcast",
      () =>
        fetch("/api/v1/platform/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: broadcastTitle, body: broadcastBody }),
        }),
      "Broadcast sent to every active tenant.",
    );
    if (ok) {
      setBroadcastTitle("");
      setBroadcastBody("");
    }
  }

  async function reply(ticketId: string) {
    const body = replyDraft[ticketId]?.trim();
    if (!body) return;
    const ok = await act(`reply:${ticketId}`, () =>
      fetch("/api/v1/platform/support-queue", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, body }),
      }),
      "Reply posted to the requester.",
    );
    if (ok) setReplyDraft((d) => ({ ...d, [ticketId]: "" }));
  }

  const atRisk = riskTenants.filter((t) => t.risk !== "low");
  const trialChasers = riskTenants.filter((t) => t.trialDaysLeft !== null && t.trialDaysLeft <= 7);

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-secondary">{notice}</p>
      ) : null}

      {/* ---------- E.1 risk board ---------- */}
      <Card>
        <CardHeader
          title={`At risk this week (${atRisk.length})`}
          subtitle="Dormant >7d = medium, >14d or never active = high. Setup incomplete companies are flagged for onboarding calls."
        />
        {riskTenants.length === 0 ? (
          <EmptyState title="No tenants registered yet" />
        ) : (
          <ul className="divide-y divide-border-default">
            {riskTenants.map((t) => (
              <li key={t.organizationId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 text-sm">
                <Badge tone={RISK_TONE[t.risk]}>{t.risk}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-primary">
                    {t.name}
                    {!t.setupDone && <span className="ml-2 text-xs font-normal text-tertiary">setup incomplete</span>}
                  </p>
                  <p className="text-xs text-tertiary">
                    {t.active7d}/{t.userCount} active 7d ·{" "}
                    {t.lastActiveAt ? `last active ${timeAgo(t.lastActiveAt)}` : "never active"}
                    {t.trialDaysLeft !== null ? ` · trial ends in ${t.trialDaysLeft}d` : ""} · {t.plan}/{t.billingStatus}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {trialChasers.length > 0 ? (
          <p className="border-t border-border-subtle px-5 py-3 text-xs text-tertiary">
            Trials ending ≤7d: {trialChasers.map((t) => t.name).join(", ")}
          </p>
        ) : null}
      </Card>

      {/* ---------- E.2 impersonation ---------- */}
      <Card>
        <CardHeader
          title="Support impersonation"
          subtitle="Only tenants that granted explicit consent appear here. Every window is logged and time-boxed."
        />
        {grants.length === 0 ? (
          <EmptyState title="No live grants" hint="Tenants grant access from Settings → Organization → Support access." />
        ) : (
          <ul className="divide-y divide-border-default">
            {grants.map((g) => (
              <li key={g.grantId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-primary">{g.orgName}</p>
                  <p className="text-xs text-tertiary">
                    “{g.reason}” · expires {new Date(g.expiresAt).toLocaleString()}
                    {g.operatorLabel ? ` · for ${g.operatorLabel}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy === g.grantId}
                  onClick={() => openImpersonation(g.grantId, g.organizationId)}
                  className={`${btn.secondary} ${btn.small}`}
                >
                  Open window
                </button>
              </li>
            ))}
          </ul>
        )}

        {targets && openGrant ? (
          <div className="border-t border-border-subtle px-5 py-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-tertiary">
              Impersonate as (you will act as this user; your console session resumes after “Stop”)
            </p>
            <div className="flex flex-wrap gap-2">
              {targets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={busy === `imp:${t.id}`}
                  onClick={() => impersonate(openGrant, t.id)}
                  className={`${btn.secondary} ${btn.small}`}
                >
                  {t.name} <span className="text-tertiary">· {t.email}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {ledger.length > 0 ? (
          <div className="border-t border-border-subtle">
            <p className="px-5 pt-3 text-xs font-medium uppercase tracking-wide text-tertiary">Impersonation ledger</p>
            <ul className="divide-y divide-border-default">
              {ledger.slice(0, 10).map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-5 py-2 text-xs">
                  <span className="font-medium text-primary">{l.orgName}</span>
                  <span className="text-tertiary">
                    by {l.operatorName} · {timeAgo(l.startedAt)} · {l.endedAt ? "ended" : "LIVE"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-tertiary">“{l.reason}”</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {/* ---------- B-fix: two-person approvals ---------- */}
      <Card>
        <CardHeader
          title={`Pending approvals (${pendingOps.length})`}
          subtitle="Cancelling a PAYING tenant needs a second operator. The requester cannot approve their own request."
        />
        {pendingOps.length === 0 ? (
          <EmptyState title="No approvals waiting" />
        ) : (
          <ul className="divide-y divide-border-default">
            {pendingOps.map((op) => (
              <li key={op.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 text-sm">
                <Badge tone="amber">{op.kind === "cancel_subscription" ? "cancel" : op.kind}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-primary">{op.orgName}</p>
                  <p className="text-xs text-tertiary">
                    requested by {op.requesterName} · {timeAgo(op.createdAt)} · “{op.reason}”
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy === `op:${op.id}` || op.requestedBy === selfUserId}
                  onClick={() => decide(op.id, "approve")}
                  className={`${btn.primary} ${btn.small}`}
                  title={op.requestedBy === selfUserId ? "You requested this — another operator must approve" : "Approve"}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy === `op:${op.id}`}
                  onClick={() => decide(op.id, "reject")}
                  className="text-xs text-danger hover:underline disabled:opacity-50"
                >
                  Reject
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------- E.3 broadcast ---------- */}
      <Card>
        <CardHeader title="Broadcast" subtitle="Publishes an announcement + in-app notification in EVERY active tenant." />
        <div className="space-y-2 px-5 pb-4">
          <input
            value={broadcastTitle}
            onChange={(e) => setBroadcastTitle(e.target.value)}
            placeholder="Title — e.g. New this month: payroll runs"
            maxLength={300}
            className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-primary"
          />
          <textarea
            value={broadcastBody}
            onChange={(e) => setBroadcastBody(e.target.value)}
            placeholder="What changed, what to do, link to docs…"
            rows={3}
            maxLength={10_000}
            className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-primary"
          />
          <button
            type="button"
            disabled={busy === "broadcast" || !broadcastTitle.trim() || !broadcastBody.trim()}
            onClick={() => broadcast()}
            className={`${btn.primary} ${btn.small}`}
          >
            {busy === "broadcast" ? "Broadcasting…" : "Broadcast to all tenants"}
          </button>
        </div>
      </Card>

      {/* ---------- E.4 support queue ---------- */}
      <Card>
        <CardHeader
          title={`Support queue (${queue.length})`}
          subtitle="Tenant tickets pulled to the platform. Reply as the operator — the requester is notified and first-response SLA stamps."
        />
        {queue.length === 0 ? (
          <EmptyState title="Queue is empty" hint="Escalate a tenant ticket from the tenant registry when they need platform help." />
        ) : (
          <ul className="divide-y divide-border-default">
            {queue.map((t) => (
              <li key={t.id} className="space-y-2 px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium text-primary">{t.orgName}</span>
                  <span className="min-w-0 flex-1 truncate text-secondary">{t.title}</span>
                  <Badge tone={t.slaState === "breached" ? "red" : t.slaState === "at_risk" ? "amber" : "neutral"}>
                    {t.slaState}
                  </Badge>
                  <span className="text-xs text-tertiary">
                    {t.priority} · by {t.requesterName} · escalated {t.escalatedAt ? timeAgo(t.escalatedAt) : "—"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    value={replyDraft[t.id] ?? ""}
                    onChange={(e) => setReplyDraft((d) => ({ ...d, [t.id]: e.target.value }))}
                    placeholder="Reply to the requester…"
                    className="min-w-0 flex-1 rounded-md border border-border-default bg-surface px-3 py-1.5 text-xs text-primary"
                  />
                  <button
                    type="button"
                    disabled={busy === `reply:${t.id}` || !replyDraft[t.id]?.trim()}
                    onClick={() => reply(t.id)}
                    className={`${btn.primary} ${btn.small}`}
                  >
                    Reply
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
