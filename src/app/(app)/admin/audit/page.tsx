export const dynamic = "force-dynamic";

import Link from "next/link";

import { AdminSection } from "@/components/admin-ui";
import { Card, EmptyState, btn } from "@/components/ui";
import { CsvExportLink } from "@/components/csv-export";
import { PageHeader } from "@/components/page-header";
import { SECURITY_AUDIT_QUERY } from "@/lib/admin-security";
import { requireAuthPage } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listAuditLogs } from "@/modules/admin/service";
import { Download } from "lucide-react";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; actorId?: string }>;
}) {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "admin") || !can(ctx.access, "audit.view")) {
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
  const entries = await listAuditLogs(ctx, {
    q: sp.q,
    action: sp.action,
    actorId: sp.actorId,
    limit: PAGE_SIZE,
  });

  const actorList = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.organizationId, ctx.user.organizationId)))
    .orderBy(asc(users.name))
    .limit(200);

  const csvRows: (string | number | null | undefined)[][] = [
    ["created_at", "action", "entity_type", "entity_id", "actor_name", "ip", "old_value", "new_value"],
    ...entries.map((e) => [
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
        </CsvExportLink>
      </PageHeader>

      <AdminSection title="Filters" subtitle="Applies to the list and the CSV export">
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
          <label className="min-w-0 text-xs font-medium text-tertiary sm:col-span-2">
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

      <AdminSection title="Events" subtitle={`${entries.length} shown`}>
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-tertiary">No matching audit events.</p>
        ) : (
          <ul className="divide-y divide-border-subtle text-sm">
            {entries.map((e) => (
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
        {entries.length === PAGE_SIZE ? (
          <p className="mt-3 text-xs text-tertiary">
            Showing the first {PAGE_SIZE} matches. Refine the filter to narrow further.
          </p>
        ) : null}
      </AdminSection>
    </div>
  );
}
