export const dynamic = "force-dynamic";

import Link from "next/link";

import { AdminNav, AdminSection } from "@/components/admin-ui";
import { Card, EmptyState, btn } from "@/components/ui";
import { CsvExportLink } from "@/components/csv-export";
import { PageHeader } from "@/components/page-header";
import { AUDIT_ACTION_GROUPS, auditGroupQuery, SECURITY_AUDIT_QUERY } from "@/lib/admin-security";
import { adminTabsFor } from "@/lib/admin-nav";
import { requireAuthPage } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { decodeAuditCursor, encodeAuditCursor, listAuditLogs } from "@/modules/admin/service";
import { Download } from "lucide-react";
import { cx } from "@/lib/cx";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

/**
 * Quick filters — one click to the investigation views admins actually need.
 * `q` filters are OR-ed by the service; `actions` are exact matches.
 */
/** G-28 — chips are derived from `AUDIT_ACTION_GROUPS` in lib/admin-security.ts. */
const QUICK_FILTERS: {
  key: string;
  label: string;
  query: Record<string, string>;
  tone: "neutral" | "warning" | "danger";
}[] = AUDIT_ACTION_GROUPS.map((g) => ({
  key: g.key,
  label: g.label,
  query: { action: auditGroupQuery(g) },
  tone: g.tone,
}));

function isActiveFilter(
  sp: { q?: string; action?: string; actorId?: string },
  f: (typeof QUICK_FILTERS)[number],
): boolean {
  // A chip is "active" when the current action param equals the chip's list
  // and no other filter overrides it.
  return !!sp.action && sp.action === f.query.action && !sp.q && !sp.actorId;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    action?: string;
    actorId?: string;
    since?: string;
    until?: string;
    /** G-03 keyset cursor: opaque "rows older than this" pointer. */
    before?: string;
    /** Colon-joined cursor history for ← Previous (stateless, no session). */
    stack?: string;
  }>;
}) {
  const ctx = await requireAuthPage();
  const canAudit = can(ctx.access, "audit.view");
  if (!isModuleEnabled(ctx.org.modules, "admin") || !canAudit) {
    return (
      <>
        <PageHeader title="Audit log" />
        <Card>
          <EmptyState title="Audit log" hint="You don't have audit access." />
        </Card>
      </>
    );
  }

  const sp = await searchParams;
  const depth = Math.max(0, (sp.stack ?? "").split(":").filter(Boolean).length);
  const since = sp.since ? new Date(sp.since) : undefined;
  const until = sp.until ? new Date(`${sp.until}T23:59:59.999Z`) : undefined;
  const entries = await listAuditLogs(ctx, {
    q: sp.q,
    action: sp.action,
    actorId: sp.actorId,
    since,
    untilDate: until,
    limit: PAGE_SIZE + 1,
    before: decodeAuditCursor(sp.before),
  });

  const hasMore = entries.length > PAGE_SIZE;
  const visible = hasMore ? entries.slice(0, PAGE_SIZE) : entries;

  const actorList = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.organizationId, ctx.user.organizationId)))
    .orderBy(asc(users.name))
    .limit(200);

  // Preserve every active filter across pagination clicks.
  const carry: Record<string, string> = {};
  if (sp.q) carry.q = sp.q;
  if (sp.action) carry.action = sp.action;
  if (sp.actorId) carry.actorId = sp.actorId;
  if (sp.since) carry.since = sp.since;
  if (sp.until) carry.until = sp.until;

  // Keyset pagination (G-03): "Load more" seeks past the last visible row via
  // an opaque cursor; "Previous" pops the cursor stack (deepest 31 cursors).
  const stack = (sp.stack ?? "").split(":").filter(Boolean);
  const nextPageHref = hasMore && visible.length > 0
    ? `/admin/audit?${new URLSearchParams({
        ...carry,
        before: encodeAuditCursor(visible[visible.length - 1]!),
        stack: [...stack.slice(-30), sp.before ?? ""].filter(Boolean).join(":"),
      })}`
    : null;
  const prevPageHref =
    stack.length > 0
      ? `/admin/audit?${new URLSearchParams({
          ...carry,
          before: stack[stack.length - 1] ?? "",
          stack: stack.slice(0, -1).join(":"),
        })}`
      : null;

  const csvRows: (string | number | null | undefined)[][] = [
    ["created_at", "action", "entity_type", "entity_id", "actor_name", "ip", "old_value", "new_value"],
    ...visible.map((e) => [
      new Date(e.createdAt).toISOString(),
      e.action,
      e.entityType,
      e.entityId ?? "",
      e.actorName ?? "",
      e.ip ?? "",
      e.oldValue ? JSON.stringify(e.oldValue) : "",
      e.newValue ? JSON.stringify(e.newValue) : "",
    ]),
  ];

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader title="Audit log" subtitle="Every important administrative action. Filter, search, and export.">
        <Link
          href={`/admin/audit?action=${encodeURIComponent(SECURITY_AUDIT_QUERY)}`}
          className={`${btn.secondary} ${btn.small} w-full sm:w-auto`}
        >
          Security only
        </Link>
        <CsvExportLink
          filename={`audit-${new Date().toISOString().slice(0, 10)}.csv`}
          rows={csvRows}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-secondary transition hover:bg-surface-hover sm:w-auto"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
          <span className="sr-only">(exports the rows currently shown on this page)</span>
        </CsvExportLink>
      </PageHeader>

      <AdminNav
        items={adminTabsFor((p) => can(ctx.access, p), ctx.org.modules)}
      />

      <AdminSection title="Quick filters" subtitle="One click to the common investigations">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/audit"
            className={cx(
              "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition",
              !sp.q && !sp.action && !sp.actorId && !sp.since && !sp.until
                ? "border-brand bg-brand-subtle text-brand-text"
                : "border-border-strong bg-surface text-secondary hover:bg-surface-hover",
            )}
          >
            All events
          </Link>
          {QUICK_FILTERS.map((f) => {
            const active = isActiveFilter(sp, f);
            return (
              <Link
                key={f.key}
                href={`/admin/audit?${new URLSearchParams({ ...f.query })}`}
                aria-pressed={active}
                className={cx(
                  "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition",
                  active
                    ? "border-brand bg-brand-subtle text-brand-text"
                    : f.tone === "danger"
                      ? "border-danger/30 bg-surface text-danger hover:bg-danger-subtle"
                      : f.tone === "warning"
                        ? "border-warning/30 bg-surface text-warning hover:bg-warning-subtle"
                        : "border-border-strong bg-surface text-secondary hover:bg-surface-hover",
                )}
              >
                {f.label}
              </Link>
            );
          })}
        </div>
      </AdminSection>

      <AdminSection title="Filters" subtitle="Applies to the list; the CSV export includes the current page's rows only">
        <form className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <label className="min-w-0 text-xs font-medium text-tertiary">
            Search
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="action or entity…"
              className="mt-1 w-full rounded-md border border-border-default bg-surface px-3 py-1.5 text-sm text-primary"
            />
          </label>
          <label className="min-w-0 text-xs font-medium text-tertiary">
            Action
            <input
              name="action"
              defaultValue={sp.action ?? ""}
              placeholder="USER_SUSPENDED"
              className="mt-1 w-full rounded-md border border-border-default bg-surface px-3 py-1.5 font-mono text-sm text-primary"
            />
          </label>
          <label className="min-w-0 text-xs font-medium text-tertiary">
            Actor
            <select
              name="actorId"
              defaultValue={sp.actorId ?? ""}
              className="mt-1 w-full rounded-md border border-border-default bg-surface px-3 py-1.5 text-sm text-primary"
            >
              <option value="">All actors</option>
              {actorList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name ?? a.email}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="min-w-0 text-xs font-medium text-tertiary">
              From date
              <input
                type="date"
                name="since"
                defaultValue={sp.since ?? ""}
                className="mt-1 w-full rounded-md border border-border-default bg-surface px-3 py-1.5 text-sm text-primary"
              />
            </label>
            <label className="min-w-0 text-xs font-medium text-tertiary">
              To date
              <input
                type="date"
                name="until"
                defaultValue={sp.until ?? ""}
                className="mt-1 w-full rounded-md border border-border-default bg-surface px-3 py-1.5 text-sm text-primary"
              />
            </label>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
            <button type="submit" className={`${btn.primary} w-full sm:w-auto`}>
              Apply
            </button>
            <Link href="/admin/audit" className={`${btn.secondary} w-full text-center sm:w-auto`}>
              Clear
            </Link>
          </div>
        </form>
      </AdminSection>

      <AdminSection
        title="Events"
        subtitle={`Depth ${depth}${hasMore ? "+" : ""} · ${visible.length} shown`}
      >
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-tertiary">No matching audit events.</p>
        ) : (
          <ul className="divide-y divide-border-subtle text-sm">
            {visible.map((e) => (
              <li key={e.id} className="py-3">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
                  <span className="break-all font-mono text-xs text-primary">{e.action}</span>
                  <span className="shrink-0 text-xs text-tertiary">
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-0.5 break-all text-xs text-tertiary">
                  {e.entityType}
                  {e.entityId ? ` · ${e.entityId}` : ""}
                  {e.actorName ? ` · ${e.actorName}` : ""}
                  {e.ip ? ` · ${e.ip}` : ""}
                </p>
                {e.oldValue || e.newValue ? (
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md bg-surface-subtle px-2 py-1 text-[11px] text-secondary">
                    {e.oldValue ? `before: ${JSON.stringify(e.oldValue)}\n` : ""}
                    {e.newValue ? `after:  ${JSON.stringify(e.newValue)}` : ""}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {depth > 0 || hasMore ? (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
            {prevPageHref ? (
              <Link href={prevPageHref} className={`${btn.secondary} ${btn.small}`}>
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="text-xs text-tertiary">
              Showing {visible.length} events
              {hasMore ? " · more available" : ""}
            </span>
            {nextPageHref ? (
              <Link href={nextPageHref} className={`${btn.secondary} ${btn.small}`}>
                Load more →
              </Link>
            ) : (
              <span />
            )}
          </div>
        ) : null}
      </AdminSection>
    </div>
  );
}
